/**
 * Emergency Crossroad Simulator — Realistic 3D Urban World, Streetscape & Dynamic Shadows
 * Features PCFSoftShadowMap directional lighting, specular wet asphalt & puddles,
 * multi-tier buildings with storefronts/awnings/rooftops, overhang streetlights,
 * sidewalk planter trees, fire hydrants, and glass bus stop shelters.
 */
(function () {
  class WorldBuilder {
    constructor(scene) {
      this.scene = scene;
      this.worldGroup = new THREE.Group();
      this.scene.add(this.worldGroup);

      this.crossroadZPositions = [];
      this.trafficLights = [];
      this.rainSystem = null;
      this.sunLight = null;
      this.sunTarget = null;
      this.weather = 'DAY';
    }

    clearWorld() {
      this.worldGroup.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      while (this.worldGroup.children.length > 0) {
        const child = this.worldGroup.children[0];
        this.worldGroup.remove(child);
      }
      this.crossroadZPositions = [];
      this.trafficLights = [];
      this.rainSystem = null;
      this.sunLight = null;
      this.sunTarget = null;
      this._inst = null;
    }

    initInstanceCollectors() {
      this._inst = {
        yellowLine: [],
        whiteDash: [],
        puddles: [],
        crosswalkStripes: [],
        buildingTowers: [],
        buildingPlinths: [],
        buildingStorefronts: [],
        buildingAwnings: [],
        buildingCornices: [],
        buildingPenthouses: [],
        buildingWindows: [],
        hydrantBodies: [],
        hydrantDomes: [],
        hydrantNozzles: [],
        bollards: [],
        lightPoles: [],
        lightArms: [],
        lightLuminaires: [],
        lightPools: [],
        treePlanters: [],
        treeTrunks: [],
        treeCrownsMain: [],
        treeCrownsLeft: [],
        treeCrownsRight: [],
        busRoofs: [],
        busWalls: [],
        busAds: [],
        busBenches: []
      };
    }

    buildInstancedMesh(list, geo, mat, castShadow = false, receiveShadow = false) {
      if (!list || list.length === 0) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.castShadow = castShadow;
      im.receiveShadow = receiveShadow;
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      let hasColors = false;

      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        dummy.position.set(item.x, item.y, item.z);
        dummy.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0);
        dummy.scale.set(item.sx !== undefined ? item.sx : 1, item.sy !== undefined ? item.sy : 1, item.sz !== undefined ? item.sz : 1);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        if (item.color !== undefined) {
          hasColors = true;
          color.setHex(item.color);
          im.setColorAt(i, color);
        }
      }
      im.instanceMatrix.needsUpdate = true;
      if (hasColors && im.instanceColor) im.instanceColor.needsUpdate = true;
      this.worldGroup.add(im);
      return im;
    }

    flushInstances() {
      const inst = this._inst;
      if (!inst) return;
      const isWet = this.weather === 'NIGHT_RAIN';
      const isNight = this.weather === 'NIGHT_RAIN' || this.weather === 'DUSK';
      const isStreetNight = isNight || this.weather === 'FOG';

      // Road markings & puddles
      this.buildInstancedMesh(inst.yellowLine, new THREE.PlaneGeometry(0.32, 7.8), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
      this.buildInstancedMesh(inst.whiteDash, new THREE.PlaneGeometry(0.18, 3.6), new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }));
      this.buildInstancedMesh(
        inst.puddles,
        new THREE.CircleGeometry(1, 12),
        new THREE.MeshPhongMaterial({ color: 0x0f172a, specular: 0xffffff, shininess: 180, transparent: true, opacity: 0.55 })
      );
      this.buildInstancedMesh(inst.crosswalkStripes, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xf1f5f9 }));

      // Buildings
      this.buildInstancedMesh(
        inst.buildingTowers,
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x334155, shininess: 25 }),
        true,
        true
      );
      const plinthMat = new THREE.MeshPhongMaterial({ color: 0x1e293b, shininess: 40 });
      this.buildInstancedMesh(inst.buildingPlinths, new THREE.BoxGeometry(1, 3.4, 1), plinthMat);
      this.buildInstancedMesh(inst.buildingCornices, new THREE.BoxGeometry(1, 0.5, 1), plinthMat);
      this.buildInstancedMesh(
        inst.buildingStorefronts,
        new THREE.PlaneGeometry(1, 2.2),
        new THREE.MeshPhongMaterial({
          color: isNight ? 0xfde68a : 0x7dd3fc,
          emissive: isNight ? 0x78350f : 0x0c4a6e,
          shininess: 140
        })
      );
      this.buildInstancedMesh(
        inst.buildingAwnings,
        new THREE.BoxGeometry(1.1, 0.35, 1),
        new THREE.MeshLambertMaterial({ color: 0xffffff }),
        true,
        false
      );
      this.buildInstancedMesh(
        inst.buildingPenthouses,
        new THREE.BoxGeometry(1, 2.6, 1),
        new THREE.MeshLambertMaterial({ color: 0x475569 }),
        true,
        false
      );
      this.buildInstancedMesh(
        inst.buildingWindows,
        new THREE.PlaneGeometry(1, 1.25),
        new THREE.MeshPhongMaterial({
          color: isNight ? 0xfef08a : 0x93c5fd,
          emissive: isNight ? 0xca8a04 : 0x1e3a8a,
          emissiveIntensity: isNight ? 0.55 : 0.2,
          specular: 0xffffff,
          shininess: 140
        })
      );

      // Fire Hydrants & Bollards
      const redMat = new THREE.MeshPhongMaterial({ color: 0xdc2626, shininess: 90 });
      this.buildInstancedMesh(inst.hydrantBodies, new THREE.CylinderGeometry(0.18, 0.2, 0.75, 10), redMat, true, false);
      this.buildInstancedMesh(inst.hydrantDomes, new THREE.SphereGeometry(0.18, 10, 8), redMat);
      this.buildInstancedMesh(
        inst.hydrantNozzles,
        new THREE.CylinderGeometry(0.08, 0.08, 0.42, 8),
        new THREE.MeshPhongMaterial({ color: 0xe2e8f0, shininess: 130 })
      );
      this.buildInstancedMesh(
        inst.bollards,
        new THREE.CylinderGeometry(0.1, 0.11, 0.9, 8),
        new THREE.MeshPhongMaterial({ color: 0xfacc15, shininess: 80 }),
        true,
        false
      );

      // Streetlights
      const metalMat = new THREE.MeshPhongMaterial({ color: 0x334155, shininess: 80 });
      this.buildInstancedMesh(inst.lightPoles, new THREE.CylinderGeometry(0.1, 0.14, 7.2, 8), metalMat, true, false);
      this.buildInstancedMesh(inst.lightArms, new THREE.CylinderGeometry(0.06, 0.08, 2.8, 6), metalMat);
      this.buildInstancedMesh(
        inst.lightLuminaires,
        new THREE.BoxGeometry(0.65, 0.14, 0.32),
        new THREE.MeshBasicMaterial({ color: isStreetNight ? 0xfef08a : 0xe2e8f0 })
      );
      this.buildInstancedMesh(
        inst.lightPools,
        new THREE.CircleGeometry(4.2, 12),
        new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.13 })
      );

      // Trees
      this.buildInstancedMesh(inst.treePlanters, new THREE.BoxGeometry(1.4, 0.42, 1.4), new THREE.MeshLambertMaterial({ color: 0x475569 }));
      this.buildInstancedMesh(inst.treeTrunks, new THREE.CylinderGeometry(0.14, 0.2, 2.4, 8), new THREE.MeshLambertMaterial({ color: 0x5c4033 }), true, false);
      const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      this.buildInstancedMesh(inst.treeCrownsMain, new THREE.SphereGeometry(1.35, 10, 8), leafMat, true, false);
      this.buildInstancedMesh(inst.treeCrownsLeft, new THREE.SphereGeometry(0.95, 8, 8), leafMat, true, false);
      this.buildInstancedMesh(inst.treeCrownsRight, new THREE.SphereGeometry(0.9, 8, 8), leafMat, true, false);

      // Bus Stops
      this.buildInstancedMesh(inst.busRoofs, new THREE.BoxGeometry(1.8, 0.14, 4.2), new THREE.MeshPhongMaterial({ color: 0x1e293b, shininess: 90 }), true, false);
      this.buildInstancedMesh(
        inst.busWalls,
        new THREE.BoxGeometry(0.08, 2.4, 3.9),
        new THREE.MeshPhongMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.45, shininess: 140 })
      );
      this.buildInstancedMesh(inst.busAds, new THREE.BoxGeometry(1.5, 2.2, 0.12), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
      this.buildInstancedMesh(inst.busBenches, new THREE.BoxGeometry(0.55, 0.12, 2.2), new THREE.MeshLambertMaterial({ color: 0x94a3b8 }));

      this._inst = null;
    }

    buildScenarioWorld(config) {
      this.clearWorld();
      this.initInstanceCollectors();
      this.weather = config.weather || 'DAY';
      const difficulty = parseInt(config.difficulty || 2, 10);
      const numCrossings = parseInt(config.crossingsGoal || 3, 10);

      const spacing = 260;
      for (let i = 1; i <= numCrossings; i++) {
        this.crossroadZPositions.push(-i * spacing);
      }

      const totalLength = (numCrossings + 1) * spacing + 200;

      // 1. Configure Sky, Fog & Shadow-Casting Lights
      this.setupEnvironment(this.weather);

      // 2. Build Base Ground, Specular Main Avenue, Sidewalks & Wet Puddles
      this.buildMainAvenue(totalLength);

      // 3. Build Each Crossroad, Crosswalks, Traffic Lights, Hydrants & Corner Buildings
      this.crossroadZPositions.forEach((cz, idx) => {
        this.buildCrossroad(cz, idx, difficulty);
      });

      // 4. Build Multi-Tier City Blocks, Streetlights, Trees & Bus Stops
      this.buildCityBlocksAndStreetscape(totalLength, difficulty);

      // 5. Flush all collected static geometry into InstancedMeshes
      this.flushInstances();

      // 6. Optional Rain Particle System
      if (this.weather === 'NIGHT_RAIN') {
        this.buildRainParticles();
      }
    }

    setupEnvironment(weather) {
      let skyColor = 0x7ec0ee;
      let fogColor = 0x9bd0f5;
      let fogDensity = 0.0018;
      let ambientIntensity = 0.72;
      let sunIntensity = 0.95;
      let sunColor = 0xfffbeb;

      if (weather === 'DUSK') {
        skyColor = 0xd96b43;
        fogColor = 0xe88558;
        fogDensity = 0.0026;
        ambientIntensity = 0.58;
        sunIntensity = 0.92;
        sunColor = 0xff9e58;
      } else if (weather === 'NIGHT_RAIN') {
        skyColor = 0x070b14;
        fogColor = 0x090f1c;
        fogDensity = 0.0040;
        ambientIntensity = 0.36;
        sunIntensity = 0.42;
        sunColor = 0x7da2e0;
      } else if (weather === 'FOG') {
        skyColor = 0x9aa6b2;
        fogColor = 0xa7b3bf;
        fogDensity = 0.0115;
        ambientIntensity = 0.65;
        sunIntensity = 0.45;
      }

      this.scene.background = new THREE.Color(skyColor);
      this.scene.fog = new THREE.FogExp2(fogColor, fogDensity);

      const hemiLight = new THREE.HemisphereLight(skyColor, 0x1e293b, ambientIntensity * 0.85);
      hemiLight.position.set(0, 80, 0);
      this.worldGroup.add(hemiLight);

      const ambient = new THREE.AmbientLight(0xffffff, ambientIntensity * 0.45);
      this.worldGroup.add(ambient);

      // Dynamic Shadow-Casting Sun/Moon Light that follows the player along Z
      this.sunTarget = new THREE.Object3D();
      this.sunTarget.position.set(0, 0, 0);
      this.worldGroup.add(this.sunTarget);

      const dirLight = new THREE.DirectionalLight(sunColor, sunIntensity);
      dirLight.position.set(45, 78, 40);
      dirLight.target = this.sunTarget;
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.near = 10;
      dirLight.shadow.camera.far = 220;
      const d = 75;
      dirLight.shadow.camera.left = -d;
      dirLight.shadow.camera.right = d;
      dirLight.shadow.camera.top = d;
      dirLight.shadow.camera.bottom = -d;
      dirLight.shadow.bias = -0.0006;

      this.sunLight = dirLight;
      this.worldGroup.add(dirLight);

      const rimLight = new THREE.DirectionalLight(0x93c5fd, sunIntensity * 0.38);
      rimLight.position.set(-70, 60, -90);
      this.worldGroup.add(rimLight);
    }

    buildMainAvenue(totalLength) {
      const isWet = this.weather === 'NIGHT_RAIN';

      // Outer urban ground plane
      const groundGeo = new THREE.PlaneGeometry(500, totalLength + 400);
      const groundMat = new THREE.MeshLambertMaterial({
        color: isWet ? 0x121820 : 0x2c382f
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(0, -0.05, -totalLength / 2 + 100);
      ground.receiveShadow = true;
      this.worldGroup.add(ground);

      // Specular Asphalt Main Avenue (reflects emergency red/blue strobes & streetlights!)
      const roadWidth = 20;
      const roadGeo = new THREE.PlaneGeometry(roadWidth, totalLength + 300);
      const roadMat = new THREE.MeshPhongMaterial({
        color: isWet ? 0x151922 : 0x242830,
        specular: isWet ? 0x94a3b8 : 0x334155,
        shininess: isWet ? 95 : 28
      });
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.01, -totalLength / 2 + 100);
      road.receiveShadow = true;
      this.worldGroup.add(road);

      // Raised Concrete Sidewalks & Red/White Curbs along main avenue
      const swMat = new THREE.MeshPhongMaterial({
        color: isWet ? 0x475569 : 0x6e7681,
        specular: 0x334155,
        shininess: isWet ? 50 : 12
      });
      [-12.4, 12.4].forEach((sx) => {
        const swGeo = new THREE.BoxGeometry(4.8, 0.18, totalLength + 300);
        const sw = new THREE.Mesh(swGeo, swMat);
        sw.position.set(sx, 0.09, -totalLength / 2 + 100);
        sw.receiveShadow = true;
        this.worldGroup.add(sw);
      });

      for (let z = 60; z > -totalLength; z -= 8) {
        if (this.isInsideAnyCrossroad(z, 15)) continue;

        this._inst.yellowLine.push({ x: 0, y: 0.025, z, rx: -Math.PI / 2 });

        this._inst.whiteDash.push({ x: -5, y: 0.025, z, rx: -Math.PI / 2 });
        this._inst.whiteDash.push({ x: 5, y: 0.025, z, rx: -Math.PI / 2 });

        // Add glossy reflective puddles in Night Rain mode
        if (isWet && Math.abs(z) % 24 === 0) {
          const r = 1.8 + (Math.abs(z) % 3) * 0.5;
          this._inst.puddles.push({ x: ((z % 5) - 2) * 3.2, y: 0.026, z, rx: -Math.PI / 2, sx: r, sy: r, sz: 1 });
        }
      }
    }

    isInsideAnyCrossroad(z, margin = 14) {
      for (let i = 0; i < this.crossroadZPositions.length; i++) {
        if (Math.abs(z - this.crossroadZPositions[i]) < margin) return true;
      }
      return false;
    }

    buildCrossroad(cz, idx, difficulty) {
      const isWet = this.weather === 'NIGHT_RAIN';

      const crossWidth = 20;
      const crossGeo = new THREE.PlaneGeometry(440, crossWidth);
      const crossMat = new THREE.MeshPhongMaterial({
        color: isWet ? 0x171b24 : 0x282c35,
        specular: isWet ? 0x94a3b8 : 0x334155,
        shininess: isWet ? 90 : 24
      });
      const crossRoad = new THREE.Mesh(crossGeo, crossMat);
      crossRoad.rotation.x = -Math.PI / 2;
      crossRoad.position.set(0, 0.018, cz);
      crossRoad.receiveShadow = true;
      this.worldGroup.add(crossRoad);

      const boxGeo = new THREE.PlaneGeometry(20.4, 20.4);
      const boxMat = new THREE.MeshPhongMaterial({
        color: isWet ? 0x141820 : 0x21252d,
        specular: isWet ? 0xcbd5e1 : 0x475569,
        shininess: isWet ? 110 : 32
      });
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.rotation.x = -Math.PI / 2;
      boxMesh.position.set(0, 0.022, cz);
      boxMesh.receiveShadow = true;
      this.worldGroup.add(boxMesh);

      // Zebra Crosswalks
      [cz + 12.2, cz - 12.2].forEach((cwZ) => {
        for (let x = -8.8; x <= 8.8; x += 1.4) {
          this._inst.crosswalkStripes.push({ x, y: 0.03, z: cwZ, rx: -Math.PI / 2, sx: 0.75, sy: 3.0, sz: 1 });
        }
      });

      [-12.2, 12.2].forEach((cwX) => {
        for (let z = cz - 8.8; z <= cz + 8.8; z += 1.4) {
          this._inst.crosswalkStripes.push({ x: cwX, y: 0.03, z, rx: -Math.PI / 2, sx: 3.0, sy: 0.75, sz: 1 });
        }
      });

      // Stop bar
      this._inst.crosswalkStripes.push({ x: 5.0, y: 0.032, z: cz + 14.5, rx: -Math.PI / 2, sx: 9.6, sy: 0.65, sz: 1 });

      // Overhead Traffic Signal Gantry
      const signalObj = this.buildTrafficGantry(cz, idx, difficulty);
      this.trafficLights.push(signalObj);

      // Corner Fire Hydrants & Safety Bollards on Sidewalk Corners
      this.buildFireHydrant(11.3, cz + 15.2);
      this.buildFireHydrant(-11.3, cz - 15.2);
      this.buildCornerBollards(cz);

      // Multi-Tier Corner Buildings around the intersection
      const setback = difficulty === 1 ? 30 : 17.5;
      const bHeightBase = difficulty === 1 ? 12 : 24 + difficulty * 5;

      const corners = [
        { x: -setback - 8, z: cz + setback + 8 },
        { x: setback + 8, z: cz + setback + 8 },
        { x: -setback - 8, z: cz - setback - 8 },
        { x: setback + 8, z: cz - setback - 8 }
      ];

      const palette = [0x334155, 0x3b4252, 0x475569, 0x2e3440, 0x434c5e];
      corners.forEach((c, cIdx) => {
        const h = bHeightBase + ((idx * 7 + cIdx * 5) % 14);
        const color = palette[(idx + cIdx) % palette.length];
        this.buildDetailedBuilding(c.x, c.z, 18, 18, h, color, idx + cIdx);
      });
    }

    /**
     * Builds a multi-tier urban building with ground-floor retail storefront,
     * colored awning, architectural roof cornice, rooftop penthouse, and reflective windows.
     */
    buildDetailedBuilding(bx, bz, bw, bd, bh, baseColorHex, seed) {
      const facingSign = bx > 0 ? -1 : 1;

      this._inst.buildingTowers.push({ x: bx, y: bh / 2, z: bz, sx: bw, sy: bh, sz: bd, color: baseColorHex });
      this._inst.buildingPlinths.push({ x: bx, y: 1.7, z: bz, sx: bw + 0.3, sy: 1, sz: bd + 0.3 });
      this._inst.buildingStorefronts.push({
        x: bx + facingSign * (bw / 2 + 0.18),
        y: 1.5,
        z: bz,
        ry: facingSign * (Math.PI / 2),
        sx: bw * 0.72,
        sy: 1,
        sz: 1
      });

      const awningColors = [0xdc2626, 0x2563eb, 0x059669, 0xd97706];
      const awningColor = awningColors[Math.abs(seed) % awningColors.length];
      this._inst.buildingAwnings.push({
        x: bx + facingSign * (bw / 2 + 0.55),
        y: 2.95,
        z: bz,
        rz: facingSign * -0.25,
        sx: 1,
        sy: 1,
        sz: bd * 0.76,
        color: awningColor
      });

      this._inst.buildingCornices.push({ x: bx, y: bh + 0.25, z: bz, sx: bw + 0.6, sy: 1, sz: bd + 0.6 });
      this._inst.buildingPenthouses.push({ x: bx, y: bh + 1.5, z: bz, sx: bw * 0.45, sy: 1, sz: bd * 0.45 });

      this.addBuildingWindows(bx, bh, bz, bw, bd);
    }

    addBuildingWindows(bx, bh, bz, bw, bd) {
      const facingSign = bx > 0 ? -1 : 1;
      for (let y = 5.0; y < bh - 2; y += 3.4) {
        this._inst.buildingWindows.push({ x: bx, y, z: bz + bd / 2 + 0.06, sx: bw * 0.72, sy: 1, sz: 1 });
        this._inst.buildingWindows.push({
          x: bx + facingSign * (bw / 2 + 0.06),
          y,
          z: bz,
          ry: facingSign * (Math.PI / 2),
          sx: bd * 0.72,
          sy: 1,
          sz: 1
        });
      }
    }

    buildTrafficGantry(cz, idx, difficulty) {
      const poleMat = new THREE.MeshPhongMaterial({ color: 0x1e293b, shininess: 60 });
      const group = new THREE.Group();
      group.position.set(0, 0, cz - 13.2);

      const rPole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 7.6, 10), poleMat);
      rPole.position.set(11.2, 3.8, 0);
      rPole.castShadow = true;
      group.add(rPole);

      const lPole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 7.6, 10), poleMat);
      lPole.position.set(-11.2, 3.8, 0);
      lPole.castShadow = true;
      group.add(lPole);

      const bar = new THREE.Mesh(new THREE.BoxGeometry(23.0, 0.28, 0.28), poleMat);
      bar.position.set(0, 7.1, 0);
      bar.castShadow = true;
      group.add(bar);

      const redBulbs = [];
      const yellowBulbs = [];
      const greenBulbs = [];

      [2.5, 7.2].forEach((hx) => {
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 2.1, 0.55),
          new THREE.MeshLambertMaterial({ color: 0x0f172a })
        );
        box.position.set(hx, 6.5, 0.25);
        box.castShadow = true;
        group.add(box);

        const rMat = new THREE.MeshBasicMaterial({ color: 0xff2233 });
        const yMat = new THREE.MeshBasicMaterial({ color: 0x332800 });
        const gMat = new THREE.MeshBasicMaterial({ color: 0x003311 });

        const bGeo = new THREE.SphereGeometry(0.24, 10, 10);
        const rBulb = new THREE.Mesh(bGeo, rMat);
        rBulb.position.set(hx, 7.05, 0.52);
        const yBulb = new THREE.Mesh(bGeo, yMat);
        yBulb.position.set(hx, 6.5, 0.52);
        const gBulb = new THREE.Mesh(bGeo, gMat);
        gBulb.position.set(hx, 5.95, 0.52);

        group.add(rBulb, yBulb, gBulb);
        redBulbs.push(rMat);
        yellowBulbs.push(yMat);
        greenBulbs.push(gMat);
      });

      const signGeo = new THREE.BoxGeometry(5.2, 0.75, 0.15);
      const signMat = new THREE.MeshBasicMaterial({ color: 0x1d4ed8 });
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.position.set(-3.5, 7.1, 0.22);
      group.add(sign);

      this.worldGroup.add(group);

      return {
        z: cz,
        index: idx,
        state: 'RED',
        timer: idx * 4.5,
        redMats: redBulbs,
        yellowMats: yellowBulbs,
        greenMats: greenBulbs,
        difficulty
      };
    }

    /**
     * Builds a classic red cast-iron Fire Hydrant on the sidewalk corner.
     */
    buildFireHydrant(x, z) {
      this._inst.hydrantBodies.push({ x, y: 0.45, z });
      this._inst.hydrantDomes.push({ x, y: 0.82, z });
      this._inst.hydrantNozzles.push({ x, y: 0.58, z, rz: Math.PI / 2 });
    }

    buildCornerBollards(cz) {
      [
        [-10.8, cz + 14.5],
        [10.8, cz + 14.5],
        [-10.8, cz - 14.5],
        [10.8, cz - 14.5]
      ].forEach(([bx, bz]) => {
        this._inst.bollards.push({ x: bx, y: 0.52, z: bz });
      });
    }

    /**
     * Builds an overhang urban streetlight with glowing LED luminaire and ground light pool.
     */
    buildStreetlight(x, z) {
      const sign = x > 0 ? -1 : 1;
      this._inst.lightPoles.push({ x, y: 3.6, z });
      this._inst.lightArms.push({ x: x + sign * 1.25, y: 7.05, z, rz: sign * (Math.PI / 2 - 0.22) });
      this._inst.lightLuminaires.push({ x: x + sign * 2.45, y: 7.25, z });

      const isNight = this.weather === 'NIGHT_RAIN' || this.weather === 'DUSK' || this.weather === 'FOG';
      if (isNight) {
        this._inst.lightPools.push({ x: x + sign * 3.0, y: 0.028, z, rx: -Math.PI / 2 });
      }
    }

    /**
     * Builds a lush multi-sphere urban sidewalk tree inside a concrete planter box.
     */
    buildStreetTree(x, z, seed) {
      const foliageColors = [0x15803d, 0x166534, 0x14532d, 0x4d7c0f];
      const leafColor = foliageColors[Math.abs(seed) % foliageColors.length];

      this._inst.treePlanters.push({ x, y: 0.28, z });
      this._inst.treeTrunks.push({ x, y: 1.4, z });
      this._inst.treeCrownsMain.push({ x, y: 3.2, z, color: leafColor });
      this._inst.treeCrownsLeft.push({ x: x - 0.55, y: 2.85, z: z + 0.35, color: leafColor });
      this._inst.treeCrownsRight.push({ x: x + 0.55, y: 2.95, z: z - 0.35, color: leafColor });
    }

    /**
     * Builds a modern glass Bus Stop Shelter with illuminated ad panel and bench.
     */
    buildBusStop(x, z) {
      this._inst.busRoofs.push({ x, y: 2.65, z });
      this._inst.busWalls.push({ x: x + (x > 0 ? 0.8 : -0.8), y: 1.4, z });
      this._inst.busAds.push({ x, y: 1.4, z: z + 2.0 });
      this._inst.busBenches.push({ x: x + (x > 0 ? 0.45 : -0.45), y: 0.62, z: z - 0.2 });
    }

    buildCityBlocksAndStreetscape(totalLength, difficulty) {
      const palette = [0x2b3548, 0x374151, 0x3f3f46, 0x334155, 0x475569];

      // 1. Multi-tier City Block Buildings
      for (let z = 10; z > -totalLength + 80; z -= 38) {
        if (this.isInsideAnyCrossroad(z, 42)) continue;

        [-28, 28].forEach((bx, sideIdx) => {
          const h = 14 + ((Math.abs(z) + sideIdx * 11) % 20);
          const color = palette[Math.abs(z + sideIdx) % palette.length];
          this.buildDetailedBuilding(bx, z, 20, 26, h, color, z + sideIdx);
        });
      }

      // 2. Streetlights, Sidewalk Planter Trees & Bus Stops along the avenue
      for (let z = 25; z > -totalLength + 60; z -= 18) {
        if (this.isInsideAnyCrossroad(z, 22)) continue;

        if (Math.abs(z) % 36 === 0) {
          this.buildStreetlight(-11.2, z);
          this.buildStreetlight(11.2, z);
        } else {
          this.buildStreetTree(-12.6, z, z);
          this.buildStreetTree(12.6, z, z + 1);
        }

        if (Math.abs(z) % 108 === 0) {
          this.buildBusStop(12.8, z - 8);
        }
      }
    }

    buildRainParticles() {
      const count = 1800;
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 90;
        positions[i * 3 + 1] = Math.random() * 35;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 140;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: 0x93c5fd,
        size: 0.22,
        transparent: true,
        opacity: 0.55
      });
      this.rainSystem = new THREE.Points(geo, mat);
      this.worldGroup.add(this.rainSystem);
    }

    update(dt, playerZ) {
      // Keep the shadow-casting directional sun/moon light centered ahead of the player
      if (this.sunLight && this.sunTarget) {
        this.sunTarget.position.set(0, 0, playerZ - 35);
        this.sunLight.position.set(45, 78, playerZ + 5);
      }

      // Update traffic signals
      this.trafficLights.forEach((tl) => {
        tl.timer += dt;
        const approachDist = playerZ - tl.z;

        if (approachDist > 0 && approachDist < 185) {
          tl.state = 'RED';
        } else {
          const cycle = tl.timer % 18;
          if (cycle < 12) tl.state = 'RED';
          else if (cycle < 16) tl.state = 'GREEN';
          else tl.state = 'YELLOW';
        }

        const isRed = tl.state === 'RED';
        const isYellow = tl.state === 'YELLOW';
        const isGreen = tl.state === 'GREEN';

        tl.redMats.forEach((m) => m.color.setHex(isRed ? 0xff2233 : 0x33080c));
        tl.yellowMats.forEach((m) => m.color.setHex(isYellow ? 0xfbbf24 : 0x332400));
        tl.greenMats.forEach((m) => m.color.setHex(isGreen ? 0x22c55e : 0x052e16));
      });

      // Follow player with rain particles
      if (this.rainSystem) {
        const pos = this.rainSystem.geometry.attributes.position.array;
        for (let i = 0; i < pos.length; i += 3) {
          pos[i + 1] -= dt * 28;
          if (pos[i + 1] < 0) pos[i + 1] = 32;
        }
        this.rainSystem.geometry.attributes.position.needsUpdate = true;
        this.rainSystem.position.z = playerZ - 35;
      }
    }

    getNextCrossroadInfo(playerZ) {
      for (let i = 0; i < this.trafficLights.length; i++) {
        const tl = this.trafficLights[i];
        if (playerZ > tl.z - 14) {
          return {
            index: i,
            total: this.trafficLights.length,
            z: tl.z,
            distance: Math.max(0, Math.round(playerZ - tl.z - 12)),
            state: tl.state
          };
        }
      }
      return null;
    }
  }

  window.WorldBuilder = WorldBuilder;
})();
