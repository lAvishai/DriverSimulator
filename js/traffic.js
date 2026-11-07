/**
 * Emergency Crossroad Simulator — Realistic 3D Traffic, Pedestrians & Blind-Spot AI
 * Uses bevelled ExtrudeGeometry profiles, automotive metallic Phong materials,
 * tinted glass cabins, rotating 3D alloy wheels, grilles, spoilers, and articulated models.
 */
(function () {
  class TrafficAndObstacleManager {
    constructor(scene) {
      this.scene = scene;
      this.group = new THREE.Group();
      this.scene.add(this.group);

      this.crossCars = [];
      this.turningCars = [];
      this.laneBlockers = [];
      this.pedestrians = [];
      this.rearPassers = [];
      this.oncomingCars = [];
      this.sameDirCars = [];
      this.difficulty = 2;
      this.pedDensity = 'MEDIUM';
      this.sameDirTraffic = 'MEDIUM';

      // Shared materials & geometry caches for high performance + realism
      this.initSharedAssets();
    }

    initSharedAssets() {
      this.glassMat = new THREE.MeshPhongMaterial({
        color: 0x0f1c2e,
        emissive: 0x050b14,
        specular: 0xffffff,
        shininess: 140,
        transparent: true,
        opacity: 0.88
      });

      this.chromeMat = new THREE.MeshPhongMaterial({
        color: 0xdbeafe,
        specular: 0xffffff,
        shininess: 160
      });

      this.darkTrimMat = new THREE.MeshPhongMaterial({
        color: 0x18181b,
        specular: 0x444444,
        shininess: 35
      });

      this.tireMat = new THREE.MeshLambertMaterial({ color: 0x141619 });
      this.headlightMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
      this.taillightMat = new THREE.MeshBasicMaterial({ color: 0xff1e38 });
      this.brakelightMat = new THREE.MeshBasicMaterial({ color: 0xff0022 });
    }

    clear() {
      while (this.group.children.length > 0) {
        this.group.remove(this.group.children[0]);
      }
      this.crossCars = [];
      this.turningCars = [];
      this.laneBlockers = [];
      this.pedestrians = [];
      this.rearPassers = [];
      this.oncomingCars = [];
      this.sameDirCars = [];
    }

    spawnForScenario(config, crossroadZPositions) {
      this.clear();
      this.difficulty = parseInt(config.difficulty || 2, 10);
      this.pedDensity = config.pedestrians || 'MEDIUM';
      this.sameDirTraffic = config.sameDirTraffic || 'MEDIUM';

      crossroadZPositions.forEach((cz, idx) => {
        this.spawnApproachObstacles(cz, idx);
        this.spawnCrossTrafficForIntersection(cz, idx);
        this.spawnTurningTrafficForIntersection(cz, idx);
        this.spawnPedestriansForIntersection(cz, idx);
      });

      this.spawnSameDirectionTraffic(crossroadZPositions);
      this.spawnRearBlindSpotPassers(crossroadZPositions.length);
      this.spawnOncomingTraffic(crossroadZPositions.length);
    }

    /**
     * Builds a realistic 3D wheel with rubber tire tread, bevelled sidewall,
     * metallic alloy rim, 5-spoke star, and center hubcap.
     */
    createDetailedWheel(radius = 0.38, width = 0.26) {
      const wheelGroup = new THREE.Group();

      // Tire cylinder (rotated along X axis)
      const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 20);
      tireGeo.rotateZ(Math.PI / 2);
      const tire = new THREE.Mesh(tireGeo, this.tireMat);
      wheelGroup.add(tire);

      // Outer alloy rim cylinder
      const rimGeo = new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, width + 0.015, 16);
      rimGeo.rotateZ(Math.PI / 2);
      const rim = new THREE.Mesh(rimGeo, this.chromeMat);
      wheelGroup.add(rim);

      // Dark inner brake rotor well
      const wellGeo = new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, width + 0.02, 16);
      wellGeo.rotateZ(Math.PI / 2);
      const well = new THREE.Mesh(wellGeo, this.darkTrimMat);
      wheelGroup.add(well);

      // 5 Alloy Spokes on both outer sides
      for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2) / 5;
        const spokeGeo = new THREE.BoxGeometry(width + 0.03, radius * 0.58, 0.055);
        const spoke = new THREE.Mesh(spokeGeo, this.chromeMat);
        spoke.rotation.x = angle;
        wheelGroup.add(spoke);
      }

      return wheelGroup;
    }

    /**
     * Extrudes a 2D side silhouette (defined in Z-Y plane) along the X width axis,
     * centered at X = 0, with smooth rounded automotive bevels.
     */
    extrudeProfileZ(points, width, bevelSize = 0.11, bevelThickness = 0.12) {
      const shape = new THREE.Shape();
      shape.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i][0], points[i][1]);
      }
      shape.closePath();

      const extrudeSettings = {
        steps: 1,
        depth: width - bevelThickness * 2,
        bevelEnabled: true,
        bevelThickness: bevelThickness,
        bevelSize: bevelSize,
        bevelSegments: 5
      };

      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      // Rotate Y by -90 deg (-Math.PI / 2) so shape X maps directly to +Z_world
      // (keeping negative Z as the front nose and positive Z as the rear trunk/tail).
      geo.rotateY(-Math.PI / 2);
      geo.computeBoundingBox();
      const centerOffsetX = (geo.boundingBox.max.x + geo.boundingBox.min.x) / 2;
      geo.translate(-centerOffsetX, 0, 0);
      geo.computeVertexNormals();
      return geo;
    }

    /**
     * Builds realistic sculpted vehicles:
     * - 'SEDAN': Aerodynamic fastback sedan with sloped hood, raked glass, alloy wheels, grille, mirrors
     * - 'SUV': Modern crossover SUV with roof rails, sculpted fenders, fog lights, rear tailgate
     * - 'SPORTS': Low wide sports coupe with rear wing spoiler, aggressive splitter, dual exhausts
     * - 'BOX_TRUCK': Detailed commercial semi/box truck with sloped cab, chrome grille, visor, dual axles
     * - 'MOTO': Detailed street motorcycle & articulated rider with helmet visor
     */
    createVehicleMesh(type, colorHex) {
      const car = new THREE.Group();
      car.userData.wheels = [];

      const paintMat = new THREE.MeshPhongMaterial({
        color: colorHex || 0x2563eb,
        specular: 0xefefef,
        shininess: 115
      });

      if (type === 'BOX_TRUCK') {
        this.buildRealisticBoxTruck(car, colorHex);
      } else if (type === 'MOTO') {
        this.buildRealisticMotorcycle(car, colorHex);
      } else if (type === 'SUV') {
        this.buildRealisticSUV(car, paintMat);
      } else if (type === 'SPORTS') {
        this.buildRealisticSportsCoupe(car, paintMat);
      } else {
        this.buildRealisticSedan(car, paintMat);
      }

      car.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      return car;
    }

    buildRealisticSedan(car, paintMat) {
      // Lower body silhouette (Z from -2.35 front to +2.35 rear, Y height)
      const lowerPoints = [
        [-2.28, 0.24], // front lower valance
        [-2.35, 0.52], // front bumper nose
        [-2.22, 0.76], // hood leading edge
        [-1.18, 0.92], // base of windshield
        [1.35, 0.94],  // base of rear deck
        [2.22, 0.88],  // trunk lip
        [2.32, 0.56],  // rear bumper
        [2.20, 0.25]   // rear diffuser
      ];
      const lowerGeo = this.extrudeProfileZ(lowerPoints, 1.92, 0.09, 0.11);
      const lowerMesh = new THREE.Mesh(lowerGeo, paintMat);
      car.add(lowerMesh);

      // Greenhouse / Cabin roof pillar shell
      const roofPoints = [
        [-1.12, 0.88], // bottom of A-pillar
        [-0.48, 1.44], // top of windshield
        [0.62, 1.45],  // roof peak
        [1.42, 0.92]   // C-pillar base
      ];
      const roofGeo = this.extrudeProfileZ(roofPoints, 1.56, 0.08, 0.1);
      const roofMesh = new THREE.Mesh(roofGeo, paintMat);
      car.add(roofMesh);

      // Tinted Glass insert (slightly wider/longer in Z to show front, rear, and side windows)
      const glassPoints = [
        [-1.16, 0.89],
        [-0.50, 1.41],
        [0.60, 1.42],
        [1.45, 0.92]
      ];
      const glassGeo = this.extrudeProfileZ(glassPoints, 1.60, 0.05, 0.06);
      const glassMesh = new THREE.Mesh(glassGeo, this.glassMat);
      car.add(glassMesh);

      // B-Pillar black vertical divider on sides
      const bPillar = new THREE.Mesh(new THREE.BoxGeometry(1.63, 0.48, 0.12), this.darkTrimMat);
      bPillar.position.set(0, 1.15, 0.1);
      car.add(bPillar);

      // Front Grille & Lower Air Intake
      const grille = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.24, 0.08), this.darkTrimMat);
      grille.position.set(0, 0.54, -2.35);
      const grilleChrome = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.09), this.chromeMat);
      grilleChrome.position.set(0, 0.62, -2.35);
      car.add(grille, grilleChrome);

      // Sculpted Angled LED Headlights & Taillights
      [-0.68, 0.68].forEach((lx) => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.12), this.headlightMat);
        hl.position.set(lx, 0.66, -2.31);
        hl.rotation.y = lx < 0 ? 0.18 : -0.18;

        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.15, 0.1), this.taillightMat);
        tl.position.set(lx, 0.74, 2.30);
        car.add(hl, tl);
      });

      // Center LED tail light bar & rear license plate
      const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.09), this.taillightMat);
      tailBar.position.set(0, 0.78, 2.31);
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.16, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xf8fafc })
      );
      plate.position.set(0, 0.52, 2.32);
      car.add(tailBar, plate);

      // Side Wing Mirrors
      [-0.98, 0.98].forEach((mx) => {
        const mirrorPod = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.16), paintMat);
        mirrorPod.position.set(mx, 0.98, -0.82);
        car.add(mirrorPod);
      });

      // Wheel Arches & 4 Detailed Alloy Wheels
      const wheelPositions = [
        [-0.92, 0.37, -1.42],
        [0.92, 0.37, -1.42],
        [-0.92, 0.37, 1.42],
        [0.92, 0.37, 1.42]
      ];
      wheelPositions.forEach(([wx, wy, wz]) => {
        const wheel = this.createDetailedWheel(0.37, 0.25);
        wheel.position.set(wx, wy, wz);
        car.add(wheel);
        car.userData.wheels.push(wheel);
      });

      this.attachHazardBlinkers(car, 1.9, 4.65);
      car.userData.halfW = 1.05;
      car.userData.halfL = 2.38;
      return car;
    }

    buildRealisticSUV(car, paintMat) {
      // Taller, muscular SUV lower chassis
      const lowerPoints = [
        [-2.30, 0.28],
        [-2.42, 0.62],
        [-2.28, 0.96],
        [-1.15, 1.08],
        [2.25, 1.08],
        [2.38, 0.65],
        [2.26, 0.30]
      ];
      const lowerGeo = this.extrudeProfileZ(lowerPoints, 2.04, 0.1, 0.12);
      car.add(new THREE.Mesh(lowerGeo, paintMat));

      // Long SUV station-wagon greenhouse
      const roofPoints = [
        [-1.12, 1.04],
        [-0.45, 1.72],
        [1.75, 1.70],
        [2.22, 1.06]
      ];
      const roofGeo = this.extrudeProfileZ(roofPoints, 1.72, 0.08, 0.1);
      car.add(new THREE.Mesh(roofGeo, paintMat));

      // Tinted Wrap-Around SUV Windows
      const glassPoints = [
        [-1.16, 1.06],
        [-0.47, 1.68],
        [1.72, 1.66],
        [2.25, 1.08]
      ];
      const glassGeo = this.extrudeProfileZ(glassPoints, 1.76, 0.05, 0.06);
      car.add(new THREE.Mesh(glassGeo, this.glassMat));

      // Roof Rack Rails
      [-0.62, 0.62].forEach((rx) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 1.9), this.chromeMat);
        rail.position.set(rx, 1.76, 0.65);
        car.add(rail);
      });

      // Front Skid Plate & Chrome SUV Grille
      const grille = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.34, 0.1), this.darkTrimMat);
      grille.position.set(0, 0.74, -2.40);
      const skid = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.14, 0.12), this.chromeMat);
      skid.position.set(0, 0.36, -2.36);
      car.add(grille, skid);

      // Headlights & Vertical SUV Taillights
      [-0.74, 0.74].forEach((lx) => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.12), this.headlightMat);
        hl.position.set(lx, 0.82, -2.38);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.1), this.taillightMat);
        tl.position.set(lx, 0.95, 2.34);
        car.add(hl, tl);
      });

      // 4 Large Off-Road / SUV Alloy Wheels
      [
        [-0.98, 0.42, -1.48],
        [0.98, 0.42, -1.48],
        [-0.98, 0.42, 1.48],
        [0.98, 0.42, 1.48]
      ].forEach(([wx, wy, wz]) => {
        const wheel = this.createDetailedWheel(0.42, 0.28);
        wheel.position.set(wx, wy, wz);
        car.add(wheel);
        car.userData.wheels.push(wheel);
      });

      this.attachHazardBlinkers(car, 2.02, 4.78);
      car.userData.halfW = 1.1;
      car.userData.halfL = 2.42;
      return car;
    }

    buildRealisticSportsCoupe(car, paintMat) {
      // Sleek, low wedge profile
      const lowerPoints = [
        [-2.35, 0.18],
        [-2.42, 0.42],
        [-1.95, 0.68],
        [-1.05, 0.82],
        [1.45, 0.86],
        [2.28, 0.78],
        [2.32, 0.44],
        [2.18, 0.20]
      ];
      const lowerGeo = this.extrudeProfileZ(lowerPoints, 1.98, 0.08, 0.1);
      car.add(new THREE.Mesh(lowerGeo, paintMat));

      // Fastback teardrop canopy
      const roofPoints = [
        [-1.02, 0.78],
        [-0.32, 1.28],
        [0.35, 1.28],
        [1.55, 0.82]
      ];
      const roofGeo = this.extrudeProfileZ(roofPoints, 1.52, 0.07, 0.09);
      car.add(new THREE.Mesh(roofGeo, this.glassMat));

      // Rear Aerodynamic Wing Spoiler
      const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.05, 0.28), this.darkTrimMat);
      wingBlade.position.set(0, 1.04, 2.12);
      [-0.55, 0.55].forEach((sx) => {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.18), this.darkTrimMat);
        strut.position.set(sx, 0.92, 2.12);
        car.add(strut);
      });
      car.add(wingBlade);

      // Headlights & Full-Width LED Tail Strip
      [-0.72, 0.72].forEach((lx) => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.14), this.headlightMat);
        hl.position.set(lx, 0.52, -2.34);
        car.add(hl);
      });
      const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 0.1), this.taillightMat);
      ledStrip.position.set(0, 0.68, 2.30);
      car.add(ledStrip);

      // 4 Wide Low-Profile Sports Wheels
      [
        [-0.95, 0.35, -1.38],
        [0.95, 0.35, -1.38],
        [-0.95, 0.35, 1.38],
        [0.95, 0.35, 1.38]
      ].forEach(([wx, wy, wz]) => {
        const wheel = this.createDetailedWheel(0.35, 0.28);
        wheel.position.set(wx, wy, wz);
        car.add(wheel);
        car.userData.wheels.push(wheel);
      });

      this.attachHazardBlinkers(car, 1.98, 4.68);
      car.userData.halfW = 1.08;
      car.userData.halfL = 2.38;
      return car;
    }

    buildRealisticBoxTruck(car, cargoColorHex) {
      const cabPaint = new THREE.MeshPhongMaterial({
        color: 0xf8fafc,
        specular: 0xdddddd,
        shininess: 95
      });
      const cargoPaint = new THREE.MeshPhongMaterial({
        color: cargoColorHex || 0xf59e0b,
        specular: 0x888888,
        shininess: 50
      });

      // 1. Sculpted Aerodynamic Truck Cab (Z from -4.05 to -1.55)
      const cabPoints = [
        [-4.0, 0.35],
        [-4.08, 0.85],
        [-3.95, 1.35], // hood top
        [-3.15, 1.48], // windshield base
        [-2.75, 2.45], // roofline
        [-1.60, 2.52], // cab back
        [-1.60, 0.35]
      ];
      const cabGeo = this.extrudeProfileZ(cabPoints, 2.38, 0.1, 0.12);
      car.add(new THREE.Mesh(cabGeo, cabPaint));

      // Cab Windshield & Side Door Windows
      const cabGlassPoints = [
        [-3.18, 1.48],
        [-2.78, 2.38],
        [-1.78, 2.38],
        [-1.78, 1.48]
      ];
      const cabGlassGeo = this.extrudeProfileZ(cabGlassPoints, 2.42, 0.04, 0.04);
      car.add(new THREE.Mesh(cabGlassGeo, this.glassMat));

      // Chrome Front Grille & Heavy Bumper
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.34, 0.22), this.chromeMat);
      bumper.position.set(0, 0.48, -4.06);
      const grille = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.62, 0.12), this.chromeMat);
      grille.position.set(0, 0.98, -4.04);
      car.add(bumper, grille);

      // Truck Headlights & Amber Roof Clearance Lights
      [-0.92, 0.92].forEach((lx) => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.12), this.headlightMat);
        hl.position.set(lx, 0.88, -4.04);
        car.add(hl);
      });

      // 2. Cargo Box with Bevelled Edges, Aluminum Framing & Reflective Safety Tape
      const cargoPoints = [
        [-1.52, 0.68],
        [-1.52, 3.45],
        [4.05, 3.45],
        [4.05, 0.68]
      ];
      const cargoGeo = this.extrudeProfileZ(cargoPoints, 2.58, 0.08, 0.08);
      car.add(new THREE.Mesh(cargoGeo, cargoPaint));

      // Lower chassis rails & cylindrical fuel tanks
      const frameRail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.32, 7.2), this.darkTrimMat);
      frameRail.position.set(0, 0.52, 0.1);
      car.add(frameRail);

      [-1.08, 1.08].forEach((tx) => {
        const tankGeo = new THREE.CylinderGeometry(0.24, 0.24, 1.35, 14);
        tankGeo.rotateX(Math.PI / 2);
        const tank = new THREE.Mesh(tankGeo, this.chromeMat);
        tank.position.set(tx, 0.56, -1.2);
        car.add(tank);
      });

      // Red/White DOT safety stripe along cargo sides
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.61, 0.1, 5.4), stripeMat);
      stripe.position.set(0, 0.78, 1.25);
      car.add(stripe);

      // 6 Heavy-Duty Truck Wheels (Front steer axle + tandem rear axles)
      [
        [-1.12, 0.48, -3.15],
        [1.12, 0.48, -3.15],
        [-1.14, 0.48, 2.05],
        [1.14, 0.48, 2.05],
        [-1.14, 0.48, 3.12],
        [1.14, 0.48, 3.12]
      ].forEach(([wx, wy, wz]) => {
        const wheel = this.createDetailedWheel(0.48, 0.34);
        wheel.position.set(wx, wy, wz);
        car.add(wheel);
        car.userData.wheels.push(wheel);
      });

      this.attachHazardBlinkers(car, 2.55, 8.1);
      car.userData.halfW = 1.35;
      car.userData.halfL = 4.1;
      return car;
    }

    buildRealisticMotorcycle(car, colorHex) {
      const fairingMat = new THREE.MeshPhongMaterial({
        color: colorHex || 0xef4444,
        specular: 0xffffff,
        shininess: 130
      });

      // Front & Rear Motorcycle Wheels
      const frontWheel = this.createDetailedWheel(0.33, 0.14);
      frontWheel.position.set(0, 0.33, -0.78);
      const rearWheel = this.createDetailedWheel(0.34, 0.18);
      rearWheel.position.set(0, 0.34, 0.72);
      car.add(frontWheel, rearWheel);
      car.userData.wheels.push(frontWheel, rearWheel);

      // Sculpted Sportbike Fairing & Fuel Tank
      const bikePoints = [
        [-0.75, 0.55],
        [-0.55, 0.98], // front fairing & windscreen
        [-0.12, 0.95], // fuel tank top
        [0.25, 0.76],  // rider saddle
        [0.82, 0.92],  // tail cowl
        [0.55, 0.52],
        [-0.45, 0.38]
      ];
      const bikeGeo = this.extrudeProfileZ(bikePoints, 0.44, 0.06, 0.07);
      car.add(new THREE.Mesh(bikeGeo, fairingMat));

      // Chrome Front Forks & Handlebars
      [-0.12, 0.12].forEach((fx) => {
        const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 8), this.chromeMat);
        fork.position.set(fx, 0.62, -0.62);
        fork.rotation.x = 0.38;
        car.add(fork);
      });
      const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.68, 8), this.chromeMat);
      bars.rotation.z = Math.PI / 2;
      bars.position.set(0, 0.98, -0.38);
      car.add(bars);

      // Bright LED Headlight & Tail Light
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), this.headlightMat);
      hl.position.set(0, 0.82, -0.72);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.08), this.taillightMat);
      tl.position.set(0, 0.88, 0.82);
      car.add(hl, tl);

      // Articulated Rider (Leaning forward with Jacket, Helmet & Visor)
      const jacketMat = new THREE.MeshPhongMaterial({ color: 0x0f172a, shininess: 60 });
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.58, 12), jacketMat);
      torso.position.set(0, 1.18, 0.08);
      torso.rotation.x = -0.48;

      const helmetMat = new THREE.MeshPhongMaterial({ color: 0x38bdf8, specular: 0xffffff, shininess: 140 });
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 14), helmetMat);
      helmet.position.set(0, 1.48, -0.12);

      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 12), this.glassMat);
      visor.position.set(0, 1.49, -0.16);

      car.add(torso, helmet, visor);
      car.userData.halfW = 0.48;
      car.userData.halfL = 1.12;
      return car;
    }

    attachHazardBlinkers(car, width, length) {
      const leftBlinkerMat = new THREE.MeshBasicMaterial({ color: 0xff9f1c, visible: false });
      const rightBlinkerMat = new THREE.MeshBasicMaterial({ color: 0xff9f1c, visible: false });

      const bw = width * 0.28;
      const offsetX = width * 0.34;

      const fl = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.1, 0.14), leftBlinkerMat);
      fl.position.set(-offsetX, 0.56, -length / 2 + 0.08);
      const rl = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.1, 0.14), leftBlinkerMat);
      rl.position.set(-offsetX, 0.64, length / 2 - 0.08);

      const fr = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.1, 0.14), rightBlinkerMat);
      fr.position.set(offsetX, 0.56, -length / 2 + 0.08);
      const rr = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.1, 0.14), rightBlinkerMat);
      rr.position.set(offsetX, 0.64, length / 2 - 0.08);

      car.add(fl, rl, fr, rr);
      car.userData.leftBlinkerMat = leftBlinkerMat;
      car.userData.rightBlinkerMat = rightBlinkerMat;
    }

    setVehicleBlinkers(mesh, mode) {
      const lMat = mesh.userData.leftBlinkerMat;
      const rMat = mesh.userData.rightBlinkerMat;
      if (!lMat || !rMat) return;

      const flashOn = Math.floor(performance.now() / 210) % 2 === 0;
      if (mode === 'LEFT') {
        lMat.visible = flashOn;
        rMat.visible = false;
      } else if (mode === 'RIGHT') {
        lMat.visible = false;
        rMat.visible = flashOn;
      } else if (mode === 'HAZARD') {
        lMat.visible = flashOn;
        rMat.visible = flashOn;
      } else {
        lMat.visible = false;
        rMat.visible = false;
      }
    }

    spawnApproachObstacles(cz, idx) {
      if (this.sameDirTraffic === 'NONE') return;

      const colors = [0x2563eb, 0x059669, 0xd97706, 0x7c3aed, 0xe11d48, 0x475569];
      const bodyTypes = ['SEDAN', 'SUV', 'SPORTS'];

      const blockedLaneX = idx % 2 === 0 ? 7.5 : 2.5;
      const blockerType = this.difficulty >= 2 && idx % 2 === 0 ? 'BOX_TRUCK' : bodyTypes[idx % bodyTypes.length];
      const mesh = this.createVehicleMesh(blockerType, colors[idx % colors.length]);
      mesh.position.set(blockedLaneX, 0, cz + 21.5);
      this.group.add(mesh);

      this.laneBlockers.push({
        mesh,
        baseLaneX: blockedLaneX,
        x: blockedLaneX,
        z: cz + 21.5,
        hornCleared: false,
        halfW: mesh.userData.halfW,
        halfL: mesh.userData.halfL,
        label: blockerType === 'BOX_TRUCK' ? 'Stopped Box Truck' : 'Stopped Vehicle at Red Light'
      });

      if (this.sameDirTraffic === 'HIGH' || (this.sameDirTraffic === 'MEDIUM' && this.difficulty >= 3)) {
        const otherLaneX = blockedLaneX === 7.5 ? 2.5 : 7.5;
        const mesh2 = this.createVehicleMesh('SUV', colors[(idx + 2) % colors.length]);
        mesh2.position.set(otherLaneX, 0, cz + 46);
        this.group.add(mesh2);
        this.laneBlockers.push({
          mesh: mesh2,
          baseLaneX: otherLaneX,
          x: otherLaneX,
          z: cz + 46,
          hornCleared: false,
          halfW: mesh2.userData.halfW,
          halfL: mesh2.userData.halfL,
          label: 'Queued Rush-Hour SUV'
        });
      }

      if (this.sameDirTraffic === 'HIGH') {
        const mesh3 = this.createVehicleMesh('SEDAN', colors[(idx + 4) % colors.length]);
        mesh3.position.set(blockedLaneX, 0, cz + 32);
        this.group.add(mesh3);
        this.laneBlockers.push({
          mesh: mesh3,
          baseLaneX: blockedLaneX,
          x: blockedLaneX,
          z: cz + 32,
          hornCleared: false,
          halfW: mesh3.userData.halfW,
          halfL: mesh3.userData.halfL,
          label: 'Queued Rush-Hour Sedan'
        });
      }
    }

    /**
     * Spawns moving traffic traveling in the SAME direction as the player (-Z)
     * in the player's lanes (x = 2.5 left lane and x = 7.5 right lane).
     */
    spawnSameDirectionTraffic(crossroadZPositions) {
      if (this.sameDirTraffic === 'NONE') return;

      const countPerSegment =
        this.sameDirTraffic === 'LOW' ? 2 : this.sameDirTraffic === 'MEDIUM' ? 4 : 8;
      const numCrossings = crossroadZPositions.length;
      const totalCars = countPerSegment * numCrossings;
      const totalSpanZ = (numCrossings + 1) * 260;

      const colors = [0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xe11d48, 0x64748b, 0x06b6d4];
      const styles = ['SEDAN', 'SUV', 'SPORTS', 'SEDAN'];

      for (let i = 0; i < totalCars; i++) {
        const baseLaneX = i % 2 === 0 ? 2.5 : 7.5;
        const vType = styles[i % styles.length];
        const mesh = this.createVehicleMesh(vType, colors[i % colors.length]);

        let startZ = -40 - i * (totalSpanZ / totalCars);
        // Avoid spawning directly on top of a stationary lane blocker near cz + 21..46
        crossroadZPositions.forEach((cz) => {
          if (startZ > cz + 14 && startZ < cz + 52) {
            startZ -= 42;
          }
        });

        mesh.position.set(baseLaneX, 0, startZ);
        this.group.add(mesh);

        const baseSpeed = 9.5 + (i % 3) * 2.2;

        this.sameDirCars.push({
          mesh,
          baseLaneX,
          x: baseLaneX,
          z: startZ,
          baseSpeed,
          currentSpeed: baseSpeed,
          reactionDelay: 0.18 + (i % 5) * 0.16, // 0.18s to 0.82s realistic human reaction delay
          reactionTimer: 0,
          hornCleared: false,
          halfW: mesh.userData.halfW,
          halfL: mesh.userData.halfL,
          label: `Same-Direction ${vType}`
        });
      }
    }

    spawnCrossTrafficForIntersection(cz, idx) {
      const carsPerDir = 2 + this.difficulty;
      const colors = [0xdc2626, 0x2563eb, 0xd97706, 0x059669, 0x7c3aed, 0x334155, 0xf1f5f9, 0x0891b2];
      const carStyles = ['SEDAN', 'SUV', 'SPORTS', 'SEDAN'];

      const lanes = [
        { z: cz + 6.8, dir: 1, baseSpeed: 11 + this.difficulty * 2.8 },
        { z: cz + 2.4, dir: 1, baseSpeed: 13 + this.difficulty * 3.2 },
        { z: cz - 2.4, dir: -1, baseSpeed: 12 + this.difficulty * 3.0 },
        { z: cz - 6.8, dir: -1, baseSpeed: 10 + this.difficulty * 2.5 }
      ];

      lanes.forEach((lane, lIdx) => {
        for (let c = 0; c < carsPerDir; c++) {
          const isTruck = c === 0 && lIdx === 0 && this.difficulty >= 2;
          const vType = isTruck ? 'BOX_TRUCK' : carStyles[(c + lIdx) % carStyles.length];
          const mesh = this.createVehicleMesh(vType, colors[(c + lIdx + idx) % colors.length]);

          const spacing = 190 / carsPerDir;
          const startX = -95 + c * spacing + lIdx * 9;
          mesh.position.set(startX, 0, lane.z);
          mesh.rotation.y = lane.dir === 1 ? -Math.PI / 2 : Math.PI / 2;
          this.group.add(mesh);

          let behavior = 'NORMAL';
          if (this.difficulty >= 3 && c === 1 && lIdx === 1) behavior = 'PANICKED';
          else if (this.difficulty >= 3 && c === 2) behavior = 'AGGRESSIVE';

          this.crossCars.push({
            mesh,
            crossroadZ: cz,
            z: lane.z,
            x: startX,
            dir: lane.dir,
            baseSpeed: lane.baseSpeed + (c % 2) * 2.0,
            currentSpeed: lane.baseSpeed,
            reactionDelay: 0.15 + ((c + lIdx) % 4) * 0.18,
            reactionTimer: 0,
            halfW: mesh.userData.halfL,
            halfL: mesh.userData.halfW,
            behavior,
            yielded: false,
            panickedStopped: false,
            label: isTruck ? 'Cross-Traffic Box Truck' : `Cross-Traffic ${vType}`
          });
        }
      });
    }

    /**
     * Spawns crossroad vehicles that signal with left/right turn blinkers and
     * execute smooth 90-degree turns through the intersection box onto the main avenue.
     */
    spawnTurningTrafficForIntersection(cz, idx) {
      const colors = [0xf59e0b, 0x3b82f6, 0x10b981, 0xec4899];
      const styles = ['SEDAN', 'SUV', 'SPORTS'];

      // Two turning streams per crossroad:
      // 1) Approaching from West (-X -> +X at z = cz + 6.8), signaling LEFT turn into -Z forward lane (x = 7.5)
      // 2) Approaching from East (+X -> -X at z = cz - 6.8), signaling RIGHT turn into -Z forward lane (x = 7.5)
      const turnConfigs = [
        {
          blinker: 'LEFT',
          p0: { x: -42 - idx * 8, z: cz + 6.8 },
          p1: { x: 6.5, z: cz + 6.8 },
          p2: { x: 7.5, z: cz - 55 },
          startYaw: -Math.PI / 2,
          endYaw: 0
        },
        {
          blinker: 'RIGHT',
          p0: { x: 46 + idx * 7, z: cz - 6.8 },
          p1: { x: 7.5, z: cz - 6.8 },
          p2: { x: 7.5, z: cz - 65 },
          startYaw: Math.PI / 2,
          endYaw: 0
        }
      ];

      turnConfigs.forEach((tc, tIdx) => {
        const vType = styles[(idx + tIdx) % styles.length];
        const mesh = this.createVehicleMesh(vType, colors[(idx + tIdx) % colors.length]);
        mesh.position.set(tc.p0.x, 0, tc.p0.z);
        mesh.rotation.y = tc.startYaw;
        this.group.add(mesh);

        this.turningCars.push({
          mesh,
          crossroadZ: cz,
          blinker: tc.blinker,
          p0: tc.p0,
          p1: tc.p1,
          p2: tc.p2,
          t: (tIdx * 0.32) % 1.0,
          speedT: 0.11 + this.difficulty * 0.015,
          currentSpeedT: 0.11,
          x: tc.p0.x,
          z: tc.p0.z,
          halfW: 1.15,
          halfL: 2.2,
          label: `Turning ${vType} (${tc.blinker} Turn)`
        });
      });
    }

    /**
     * Articulated 3D Pedestrian with rounded torso, swinging left/right legs & arms,
     * sculpted head/hair, and archetype props (glowing smartphone + headphones or stroller).
     */
    createPedestrianMesh(archetype) {
      const ped = new THREE.Group();

      let jacketColor = 0x16a34a;
      if (archetype === 'PHONE_ZOMBIE') jacketColor = 0x06b6d4;
      else if (archetype === 'SLOW_STROLLER') jacketColor = 0xf97316;

      const pantsMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
      const jacketMat = new THREE.MeshPhongMaterial({ color: jacketColor, shininess: 40 });
      const skinMat = new THREE.MeshLambertMaterial({ color: 0xfde68a });

      // Left & Right Legs (pivoted at hip for walking animation)
      const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.78, 10), pantsMat);
      leftLeg.position.set(-0.12, 0.39, 0);
      const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.78, 10), pantsMat);
      rightLeg.position.set(0.12, 0.39, 0);

      // Rounded Torso & Shoulders
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.72, 12), jacketMat);
      torso.position.set(0, 1.12, 0);

      // Left & Right Arms
      const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.62, 10), jacketMat);
      leftArm.position.set(-0.27, 1.1, 0);
      const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.62, 10), jacketMat);
      rightArm.position.set(0.27, 1.1, 0);

      // Head & Hair Cap
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 14), skinMat);
      head.position.set(0, 1.68, 0);
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.215, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshLambertMaterial({ color: 0x27272a })
      );
      hair.position.set(0, 1.7, -0.02);

      ped.add(leftLeg, rightLeg, torso, leftArm, rightArm, head, hair);
      ped.userData.leftLeg = leftLeg;
      ped.userData.rightLeg = rightLeg;
      ped.userData.leftArm = leftArm;
      ped.userData.rightArm = rightArm;

      if (archetype === 'PHONE_ZOMBIE') {
        rightArm.rotation.x = -0.85;
        rightArm.position.z = 0.18;
        const phone = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.22, 0.04),
          new THREE.MeshBasicMaterial({ color: 0x67e8f9 })
        );
        phone.position.set(0.18, 1.32, 0.38);
        phone.rotation.x = -0.4;
        ped.add(phone);
      } else if (archetype === 'SLOW_STROLLER') {
        leftArm.rotation.x = -0.7;
        rightArm.rotation.x = -0.7;
        // Rounded Baby Stroller with wheels and canopy
        const strollerGroup = new THREE.Group();
        const basket = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.22, 0.5, 12),
          new THREE.MeshPhongMaterial({ color: 0xec4899 })
        );
        basket.position.set(0, 0.52, 0.62);
        const canopy = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
          new THREE.MeshPhongMaterial({ color: 0xf472b6 })
        );
        canopy.position.set(0, 0.76, 0.56);
        strollerGroup.add(basket, canopy);
        ped.add(strollerGroup);
      }

      const alertBadge = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xef4444 })
      );
      alertBadge.position.set(0, 2.18, 0);
      alertBadge.visible = false;
      ped.add(alertBadge);
      ped.userData.alertBadge = alertBadge;

      ped.traverse((child) => {
        if (child.isMesh && child !== alertBadge) {
          child.castShadow = true;
        }
      });

      return ped;
    }

    spawnPedestriansForIntersection(cz, idx) {
      let count = 3;
      if (this.pedDensity === 'LOW') count = 2;
      else if (this.pedDensity === 'MEDIUM') count = 4;
      else if (this.pedDensity === 'HIGH') count = 7;

      count += Math.max(0, this.difficulty - 1);

      for (let p = 0; p < count; p++) {
        let cwZ = p % 2 === 0 ? cz + 12.2 : cz - 12.2;
        if (this.pedDensity === 'HIGH' && p === count - 1) {
          cwZ = cz + 18.5;
        }

        let archetype = 'STANDARD';
        if (p % 3 === 1) archetype = 'PHONE_ZOMBIE';
        else if (p % 4 === 2) archetype = 'SLOW_STROLLER';

        const mesh = this.createPedestrianMesh(archetype);
        const startX = -10.5 + ((p * 4.3) % 21);
        const dir = p % 2 === 0 ? 1 : -1;
        mesh.position.set(startX, 0, cwZ);
        mesh.rotation.y = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
        this.group.add(mesh);

        const baseSpeed = archetype === 'SLOW_STROLLER' ? 1.45 : archetype === 'PHONE_ZOMBIE' ? 1.8 : 2.35;

        this.pedestrians.push({
          mesh,
          archetype,
          x: startX,
          z: cwZ,
          crossroadZ: cz,
          dir,
          baseSpeed,
          panicked: false,
          halfW: 0.55,
          halfL: 0.55,
          bobPhase: Math.random() * Math.PI * 2,
          label:
            archetype === 'PHONE_ZOMBIE'
              ? 'Distracted Headphone Pedestrian'
              : archetype === 'SLOW_STROLLER'
              ? 'Pedestrian with Stroller'
              : 'Crosswalk Pedestrian'
        });
      }
    }

    spawnRearBlindSpotPassers(numCrossings) {
      if (this.sameDirTraffic === 'NONE') return;
      const totalPassers = 3 + numCrossings * 2;
      for (let i = 0; i < totalPassers; i++) {
        const laneX = 9.0; // Stay in outer right curb lane so they never cross the player's lane
        const startZ = -60 - i * 95; // Spawn well ahead of player start (z = 32)
        const mesh = this.createVehicleMesh('MOTO', i % 2 === 0 ? 0xfbbf24 : 0x38bdf8);
        mesh.position.set(laneX, 0, startZ);
        this.group.add(mesh);

        this.rearPassers.push({
          mesh,
          baseLaneX: laneX,
          x: laneX,
          z: startZ,
          speed: 20 + (i % 3) * 3.0,
          halfW: 0.55,
          halfL: 1.15,
          label: 'Blind-Spot Motorcycle'
        });
      }
    }

    /**
     * Spawns oncoming traffic traveling toward the player (+Z) in the opposite lanes
     * (x = -2.5 inner oncoming lane and x = -7.5 outer oncoming lane).
     */
    spawnOncomingTraffic(numCrossings) {
      const colors = [0xe11d48, 0x2563eb, 0x059669, 0xd97706, 0x7c3aed, 0xf8fafc, 0x0891b2, 0x475569];
      const styles = ['SEDAN', 'SUV', 'SPORTS', 'BOX_TRUCK', 'SEDAN'];
      const totalCars = (4 + this.difficulty * 2) * numCrossings;
      const totalSpanZ = (numCrossings + 1) * 260;

      for (let i = 0; i < totalCars; i++) {
        const baseLaneX = i % 2 === 0 ? -2.5 : -7.5;
        const vType = i % 6 === 0 && this.difficulty >= 2 ? 'BOX_TRUCK' : styles[i % styles.length];
        const mesh = this.createVehicleMesh(vType, colors[i % colors.length]);

        let startZ = -totalSpanZ + i * (totalSpanZ / totalCars);
        if (startZ > -30) startZ -= 65;
        mesh.position.set(baseLaneX, 0, startZ);
        // Rotate 180 deg so headlights face +Z (coming toward the player!)
        mesh.rotation.y = Math.PI;
        this.group.add(mesh);

        const baseSpeed = 13 + this.difficulty * 2.4 + (i % 3) * 2.0;

        this.oncomingCars.push({
          mesh,
          baseLaneX,
          x: baseLaneX,
          z: startZ,
          baseSpeed,
          currentSpeed: baseSpeed,
          totalSpanZ,
          halfW: mesh.userData.halfW,
          halfL: mesh.userData.halfL,
          label: vType === 'BOX_TRUCK' ? 'Oncoming Box Truck' : `Oncoming ${vType}`
        });
      }
    }

    spinVehicleWheels(mesh, distMoved) {
      const wheels = mesh.userData.wheels;
      if (!wheels) return;
      const rotDelta = -distMoved / 0.38;
      for (let i = 0; i < wheels.length; i++) {
        wheels[i].rotation.x += rotDelta;
      }
    }

    update(dt, playerState) {
      const {
        x: px,
        z: pz,
        speedMs,
        halfW: pHalfW,
        halfL: pHalfL,
        sirenMode,
        hornActive,
        paActive,
        lightsOn
      } = playerState;

      let alertRadius = 0;
      if (sirenMode === 'WAIL') alertRadius = 68;
      else if (sirenMode === 'YELP') alertRadius = 105;
      else if (sirenMode === 'PHASER') alertRadius = 135;

      if (hornActive || paActive) {
        alertRadius = Math.max(alertRadius + 35, 95);
      }
      if (lightsOn) {
        alertRadius += 12;
      }

      let leftBlindSpotDanger = false;
      let rightBlindSpotDanger = false;
      let nearMissTriggered = false;
      let collisionObj = null;

      // 1. Update Cross-Street Traffic (with Acoustic Shadowing at Blind Corners & Reaction Delay)
      for (let i = 0; i < this.crossCars.length; i++) {
        const car = this.crossCars[i];
        const distToCrossroad = Math.hypot(px - car.x, pz - car.z);

        // Acoustic Shadowing: On Difficulty >= 2, tall corner buildings attenuate WAIL sirens
        // for side-street cars hidden behind the building line (|car.x| > 18) when player is > 28m back.
        // YELP, PHASER, and AIR HORN penetrate the acoustic shadow!
        let effectiveRadius = alertRadius;
        const playerDistToIntersection = pz - car.crossroadZ;
        const inBuildingShadow =
          this.difficulty >= 2 &&
          playerDistToIntersection > 28 &&
          Math.abs(car.x) > 18 &&
          sirenMode === 'WAIL' &&
          !hornActive &&
          !paActive;

        if (inBuildingShadow) {
          effectiveRadius *= 0.45;
        }

        let heardSiren = false;
        if (distToCrossroad < effectiveRadius) {
          if (car.behavior === 'NORMAL') {
            heardSiren = sirenMode !== 'OFF' || hornActive || paActive;
          } else if (car.behavior === 'AGGRESSIVE') {
            heardSiren = sirenMode === 'YELP' || sirenMode === 'PHASER' || hornActive || paActive;
          } else if (car.behavior === 'PANICKED') {
            if (Math.abs(car.x) < 6.5 && (hornActive || sirenMode === 'PHASER')) {
              car.panickedStopped = true;
              heardSiren = true;
            } else if (Math.abs(car.x) > 12) {
              heardSiren = sirenMode !== 'OFF';
            }
          }
        }

        // Accumulate human reaction timer (Air Horn cuts reaction delay by 3x!)
        if (heardSiren) {
          car.reactionTimer += dt * (hornActive || paActive ? 3.0 : 1.0);
        } else {
          car.reactionTimer = Math.max(0, car.reactionTimer - dt * 2.0);
        }
        const shouldYield = car.reactionTimer >= (car.reactionDelay || 0.2);

        const approachingBox =
          (car.dir === 1 && car.x > -36 && car.x < -11.5) ||
          (car.dir === -1 && car.x < 36 && car.x > 11.5);

        if ((shouldYield && approachingBox) || car.panickedStopped) {
          car.currentSpeed = Math.max(0, car.currentSpeed - dt * 26);
          this.setVehicleBlinkers(car.mesh, 'HAZARD');
        } else {
          car.currentSpeed = Math.min(car.baseSpeed, car.currentSpeed + dt * 14);
          this.setVehicleBlinkers(car.mesh, 'OFF');
        }

        const stepDist = car.currentSpeed * dt;
        car.x += car.dir * stepDist;
        this.spinVehicleWheels(car.mesh, stepDist);

        if (car.dir === 1 && car.x > 95) {
          car.x = -95;
          car.panickedStopped = false;
          car.reactionTimer = 0;
        } else if (car.dir === -1 && car.x < -95) {
          car.x = 95;
          car.panickedStopped = false;
          car.reactionTimer = 0;
        }

        car.mesh.position.x = car.x;

        const dx = Math.abs(px - car.x);
        const dz = Math.abs(pz - car.z);
        if (dx < pHalfW + car.halfW - 0.25 && dz < pHalfL + car.halfL - 0.25) {
          collisionObj = car;
        } else if (dx < pHalfW + car.halfW + 1.8 && dz < pHalfL + car.halfL + 2.2 && speedMs > 5) {
          nearMissTriggered = true;
        }
      }

      // 1b. Update Intersection Turning Traffic (90° Bezier Turn Arc + Directional Turn Blinkers)
      for (let i = 0; i < this.turningCars.length; i++) {
        const tc = this.turningCars[i];
        const dist = Math.hypot(px - tc.x, pz - tc.z);

        this.setVehicleBlinkers(tc.mesh, tc.blinker);

        const approachingTurnEntry = tc.t > 0.12 && tc.t < 0.38;
        const alerted = dist < alertRadius && (sirenMode !== 'OFF' || hornActive || paActive);

        if (approachingTurnEntry && alerted) {
          tc.currentSpeedT = Math.max(0, tc.currentSpeedT - dt * 0.55);
        } else {
          tc.currentSpeedT = Math.min(tc.speedT, tc.currentSpeedT + dt * 0.22);
        }

        const prevX = tc.x;
        const prevZ = tc.z;
        tc.t += tc.currentSpeedT * dt;
        if (tc.t >= 1.0) {
          tc.t = 0.0;
          tc.pullOverOffset = 0;
        }

        // Quadratic Bezier interpolation: B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
        const u = 1 - tc.t;
        let curveX = u * u * tc.p0.x + 2 * u * tc.t * tc.p1.x + tc.t * tc.t * tc.p2.x;
        tc.z = u * u * tc.p0.z + 2 * u * tc.t * tc.p1.z + tc.t * tc.t * tc.p2.z;

        // If already turned onto the main avenue (t >= 0.38) and siren/horn is on, pull to the right curb (x = 10.6)!
        if (tc.t >= 0.38 && alerted) {
          tc.pullOverOffset = THREE.MathUtils.lerp(tc.pullOverOffset || 0, 10.6 - curveX, dt * 4.5);
          this.setVehicleBlinkers(tc.mesh, 'RIGHT');
        } else {
          tc.pullOverOffset = THREE.MathUtils.lerp(tc.pullOverOffset || 0, 0, dt * 2.5);
        }
        tc.x = curveX + (tc.pullOverOffset || 0);

        const tx = 2 * u * (tc.p1.x - tc.p0.x) + 2 * tc.t * (tc.p2.x - tc.p1.x);
        const tz = 2 * u * (tc.p1.z - tc.p0.z) + 2 * tc.t * (tc.p2.z - tc.p1.z);
        tc.mesh.position.set(tc.x, 0, tc.z);
        tc.mesh.rotation.y = Math.atan2(-tx, -tz);

        const moveDist = Math.hypot(tc.x - prevX, tc.z - prevZ);
        this.spinVehicleWheels(tc.mesh, moveDist);

        const dx = Math.abs(px - tc.x);
        const dz = Math.abs(pz - tc.z);
        if (dx < pHalfW + tc.halfW - 0.25 && dz < pHalfL + tc.halfL - 0.25) {
          collisionObj = tc;
        } else if (dx < pHalfW + tc.halfW + 1.6 && dz < pHalfL + tc.halfL + 2.0 && speedMs > 5) {
          nearMissTriggered = true;
        }
      }

      // 2. Update Crosswalk Pedestrians (Curb-Checking, Archetype Perception & Vehicle Avoidance)
      for (let i = 0; i < this.pedestrians.length; i++) {
        const ped = this.pedestrians[i];
        const dist = Math.hypot(px - ped.x, pz - ped.z);

        let startled = false;
        if (ped.archetype === 'STANDARD') {
          startled = dist < alertRadius && (sirenMode !== 'OFF' || hornActive || paActive);
        } else if (ped.archetype === 'PHONE_ZOMBIE') {
          startled = dist < 48 && (hornActive || paActive || sirenMode === 'PHASER');
        } else if (ped.archetype === 'SLOW_STROLLER') {
          startled = dist < alertRadius && (sirenMode !== 'OFF' || hornActive);
        }

        // Curb-Checking Realism: Pedestrians still on the sidewalk edge (|ped.x| > 9.0) facing the road
        // wait safely on the curb if they hear the siren or see the emergency rig approaching!
        const onCurbEdge = Math.abs(ped.x) > 9.0;
        const steppingIntoRoad = (ped.x < -9.0 && ped.dir === 1) || (ped.x > 9.0 && ped.dir === -1);
        const curbWait =
          onCurbEdge &&
          steppingIntoRoad &&
          dist < Math.max(alertRadius + 15, 55) &&
          (ped.archetype !== 'PHONE_ZOMBIE' || hornActive || sirenMode === 'PHASER');

        ped.mesh.userData.alertBadge.visible = startled;

        let walkSpeed = ped.baseSpeed;
        if (curbWait) {
          walkSpeed = 0; // Wait safely on the sidewalk curb for the emergency vehicle to pass
        } else if (startled) {
          // Always flee AWAY from the player's vehicle X position so they never run into the car
          ped.dir = ped.x < px ? -1 : 1;
          walkSpeed = ped.archetype === 'SLOW_STROLLER' ? ped.baseSpeed * 1.35 : ped.baseSpeed * 2.4;
        }

        // Prevent pedestrians from walking into the side or front of the player's vehicle
        const nearCrosswalkZ = Math.abs(pz - ped.z) < pHalfL + 8.5;
        const walkingTowardCar = (ped.dir === 1 && ped.x < px) || (ped.dir === -1 && ped.x > px);
        if (nearCrosswalkZ && walkingTowardCar && Math.abs(ped.x - px) < pHalfW + 2.4) {
          ped.dir = ped.x < px ? -1 : 1;
          walkSpeed = ped.baseSpeed * 1.5;
        }

        ped.x += ped.dir * walkSpeed * dt;
        if (ped.x > 11.8) {
          ped.x = 11.8;
          ped.dir = -1;
        } else if (ped.x < -11.8) {
          ped.x = -11.8;
          ped.dir = 1;
        }

        ped.bobPhase += dt * walkSpeed * 4.5;
        const swing = walkSpeed > 0.1 ? Math.sin(ped.bobPhase) * 0.55 : 0;
        if (ped.mesh.userData.leftLeg) {
          ped.mesh.userData.leftLeg.rotation.x = swing;
          ped.mesh.userData.rightLeg.rotation.x = -swing;
          if (ped.archetype === 'STANDARD') {
            ped.mesh.userData.leftArm.rotation.x = -swing * 0.7;
            ped.mesh.userData.rightArm.rotation.x = swing * 0.7;
          }
        }

        ped.mesh.position.x = ped.x;
        ped.mesh.position.y = walkSpeed > 0.1 ? Math.abs(Math.sin(ped.bobPhase)) * 0.06 : 0;
        ped.mesh.rotation.y = ped.dir === 1 ? Math.PI / 2 : -Math.PI / 2;

        const dx = Math.abs(px - ped.x);
        const dz = Math.abs(pz - ped.z);
        if (dx < pHalfW + ped.halfW - 0.15 && dz < pHalfL + ped.halfL - 0.15) {
          collisionObj = ped;
        } else if (dx < pHalfW + ped.halfW + 1.5 && dz < pHalfL + ped.halfL + 1.8 && speedMs > 4) {
          nearMissTriggered = true;
        }
      }

      // 3. Update Queued Lane Blockers (clear to the right curb on ANY Siren or Air Horn!)
      for (let i = 0; i < this.laneBlockers.length; i++) {
        const blk = this.laneBlockers[i];
        const distZ = pz - blk.z;

        const sirenAlert = distZ > 15 && distZ < alertRadius && sirenMode !== 'OFF';
        const hornAlert = distZ > 15 && distZ < 120 && (hornActive || paActive);
        if (sirenAlert || hornAlert) {
          blk.hornCleared = true;
        }

        if (blk.hornCleared) {
          const clearTargetX = 10.6;
          const prevX = blk.x;
          blk.x = THREE.MathUtils.lerp(blk.x, clearTargetX, dt * (hornAlert ? 5.2 : 3.6));
          const lateralStep = blk.x - prevX;

          if (Math.abs(clearTargetX - blk.x) > 0.15) {
            blk.z -= dt * 3.0;
            this.spinVehicleWheels(blk.mesh, dt * 3.2);
          }

          blk.mesh.position.set(blk.x, 0, blk.z);
          blk.mesh.rotation.y = THREE.MathUtils.clamp(-lateralStep * 8.0, -0.38, 0.38);
          this.setVehicleBlinkers(blk.mesh, 'RIGHT');
        } else {
          this.setVehicleBlinkers(blk.mesh, 'OFF');
        }

        const dx = Math.abs(px - blk.x);
        const dz = Math.abs(pz - blk.z);
        if (dx < pHalfW + blk.halfW - 0.2 && dz < pHalfL + blk.halfL - 0.2) {
          collisionObj = blk;
        }
      }

      // 3b. Update Moving Same-Direction Traffic (pull to the right shoulder on Siren or Horn — never sit on center line!)
      for (let i = 0; i < this.sameDirCars.length; i++) {
        const sc = this.sameDirCars[i];
        const dist = Math.hypot(px - sc.x, pz - sc.z);
        const distZ = pz - sc.z;
        const isSafelyAhead = distZ > 16;

        if (isSafelyAhead && dist < 120 && (hornActive || paActive)) {
          sc.hornCleared = true;
        }

        const withinSirenRange = isSafelyAhead && dist < alertRadius && sirenMode !== 'OFF';
        if (withinSirenRange || sc.hornCleared) {
          sc.reactionTimer = (sc.reactionTimer || 0) + dt * (hornActive || paActive ? 4.0 : 2.2);
        } else {
          sc.reactionTimer = Math.max(0, (sc.reactionTimer || 0) - dt * 1.5);
        }

        const reactedToSiren = sc.reactionTimer >= (sc.reactionDelay || 0.2);
        if (reactedToSiren && isSafelyAhead) {
          sc.hornCleared = true;
        }

        // Car-Following Distance Check
        let obstacleAheadDist = 999;
        for (let b = 0; b < this.laneBlockers.length; b++) {
          const blk = this.laneBlockers[b];
          const dz = sc.z - blk.z;
          if (dz > 0 && dz < obstacleAheadDist && Math.abs(sc.x - blk.x) < 2.2) {
            obstacleAheadDist = dz;
          }
        }
        for (let j = 0; j < this.sameDirCars.length; j++) {
          if (i === j) continue;
          const other = this.sameDirCars[j];
          const dz = sc.z - other.z;
          if (dz > 0 && dz < obstacleAheadDist && Math.abs(sc.x - other.x) < 2.2) {
            obstacleAheadDist = dz;
          }
        }

        let targetX = sc.baseLaneX;

        if (sc.hornCleared) {
          sc.currentSpeed = Math.max(3.0, sc.currentSpeed - dt * 14);
          targetX = 10.6;
          this.setVehicleBlinkers(sc.mesh, 'RIGHT');
        } else if (obstacleAheadDist < 16) {
          sc.currentSpeed = Math.max(0, sc.currentSpeed - dt * 18);
          this.setVehicleBlinkers(sc.mesh, 'OFF');
        } else {
          sc.currentSpeed = Math.min(sc.baseSpeed, sc.currentSpeed + dt * 8);
          this.setVehicleBlinkers(sc.mesh, 'OFF');
        }

        const prevX = sc.x;
        const pullSpeed = hornActive ? 5.5 : 3.8;
        sc.x = THREE.MathUtils.lerp(sc.x, targetX, dt * pullSpeed);
        const lateralDelta = sc.x - prevX;

        const stepZ = sc.currentSpeed * dt;
        sc.z -= stepZ;
        this.spinVehicleWheels(sc.mesh, stepZ);

        // Recycle behind player back to ahead
        if (sc.z > pz + 65) {
          sc.z = pz - 180 - (i % 4) * 38;
          sc.x = sc.baseLaneX;
          sc.hornCleared = false;
          sc.reactionTimer = 0;
          sc.mesh.rotation.y = 0;
        }

        sc.mesh.position.set(sc.x, 0, sc.z);
        sc.mesh.rotation.y = THREE.MathUtils.clamp(-lateralDelta * 7.5, -0.35, 0.35);

        const dx = Math.abs(px - sc.x);
        const dz = Math.abs(pz - sc.z);
        if (dx < pHalfW + sc.halfW - 0.2 && dz < pHalfL + sc.halfL - 0.2) {
          collisionObj = sc;
        } else if (dx < pHalfW + sc.halfW + 1.3 && dz < pHalfL + sc.halfL + 2.0 && speedMs > 5) {
          nearMissTriggered = true;
        }
      }

      // 4. Update Rear-Approaching Blind-Spot Motorcycles
      for (let i = 0; i < this.rearPassers.length; i++) {
        const moto = this.rearPassers[i];
        const dist = Math.hypot(px - moto.x, pz - moto.z);
        const alerted = dist < alertRadius && (sirenMode !== 'OFF' || hornActive || paActive);

        const targetMotoX = alerted ? 10.8 : moto.baseLaneX;
        moto.x = THREE.MathUtils.lerp(moto.x, targetMotoX, dt * 4.0);

        const step = (alerted && moto.z < pz ? moto.speed * 0.45 : moto.speed) * dt;
        moto.z -= step;
        this.spinVehicleWheels(moto.mesh, step);

        if (moto.z < pz - 110) {
          moto.z = pz - 95 - (i % 3) * 25;
          moto.x = moto.baseLaneX;
        } else if (moto.z > pz + 75) {
          moto.z = pz - 85;
        }

        moto.mesh.position.set(moto.x, 0, moto.z);

        const relZ = moto.z - pz;
        if (relZ > -4 && relZ < 26) {
          if (moto.x < px) leftBlindSpotDanger = true;
          if (moto.x > px) rightBlindSpotDanger = true;
        }

        const dx = Math.abs(px - moto.x);
        const dz = Math.abs(pz - moto.z);
        if (dx < pHalfW + moto.halfW - 0.15 && dz < pHalfL + moto.halfL - 0.15) {
          collisionObj = moto;
        }
      }

      // 5. Update Oncoming Traffic (pull all the way to the far-left curb x = -9.6 on Siren or Horn!)
      for (let i = 0; i < this.oncomingCars.length; i++) {
        const onc = this.oncomingCars[i];
        const dist = Math.hypot(px - onc.x, pz - onc.z);
        const isAheadOfPlayer = onc.z < pz + 8;

        const sirenAlerted = isAheadOfPlayer && dist < alertRadius && sirenMode !== 'OFF';
        const hornAlerted = isAheadOfPlayer && dist < 120 && (hornActive || paActive);
        if (sirenAlerted || hornAlerted) {
          onc.hornCleared = true;
        }

        let targetX = onc.baseLaneX;
        if (onc.hornCleared) {
          onc.currentSpeed = Math.max(3.0, onc.currentSpeed - dt * 16);
          targetX = -9.6; // Pull completely to the far-left curb off the center line!
          this.setVehicleBlinkers(onc.mesh, 'RIGHT');
        } else {
          onc.currentSpeed = Math.min(onc.baseSpeed, onc.currentSpeed + dt * 10);
          this.setVehicleBlinkers(onc.mesh, 'OFF');
        }

        const pullRate = hornAlerted ? 5.2 : 3.6;
        onc.x = THREE.MathUtils.lerp(onc.x, targetX, dt * pullRate);
        const stepZ = onc.currentSpeed * dt;
        onc.z += stepZ;
        this.spinVehicleWheels(onc.mesh, stepZ);

        // Recycle behind player back to far ahead
        if (onc.z > pz + 95) {
          onc.z = pz - 260 - (i % 5) * 45;
          onc.x = onc.baseLaneX;
          onc.hornCleared = false;
        }

        onc.mesh.position.set(onc.x, 0, onc.z);

        // Trigger Left Blind-Spot LED when an oncoming car passes right alongside the player's left side
        if (Math.abs(onc.z - pz) < 12 && px - onc.x < 6.5) {
          leftBlindSpotDanger = true;
        }

        const dx = Math.abs(px - onc.x);
        const dz = Math.abs(pz - onc.z);
        if (dx < pHalfW + onc.halfW - 0.22 && dz < pHalfL + onc.halfL - 0.22) {
          collisionObj = onc;
        } else if (dx < pHalfW + onc.halfW + 1.4 && dz < pHalfL + onc.halfL + 2.2 && speedMs > 5) {
          nearMissTriggered = true;
        }
      }

      return {
        alertRadius,
        leftBlindSpotDanger,
        rightBlindSpotDanger,
        nearMissTriggered,
        collisionObj
      };
    }
  }

  window.TrafficAndObstacleManager = TrafficAndObstacleManager;
})();
