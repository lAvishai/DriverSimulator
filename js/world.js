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
      while (this.worldGroup.children.length > 0) {
        const child = this.worldGroup.children[0];
        this.worldGroup.remove(child);
      }
      this.crossroadZPositions = [];
      this.trafficLights = [];
      this.rainSystem = null;
      this.sunLight = null;
      this.sunTarget = null;
    }

    buildScenarioWorld(config) {
      this.clearWorld();
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

      // 5. Optional Rain Particle System
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
      dirLight.shadow.mapSize.width = 2048;
      dirLight.shadow.mapSize.height = 2048;
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

      // Double yellow center line, white lane dashes & reflective wet puddles
      const yellowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
      const whiteMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
      const puddleMat = new THREE.MeshPhongMaterial({
        color: 0x0f172a,
        specular: 0xffffff,
        shininess: 180,
        transparent: true,
        opacity: 0.55
      });

      for (let z = 60; z > -totalLength; z -= 8) {
        if (this.isInsideAnyCrossroad(z, 15)) continue;

        const yGeo = new THREE.PlaneGeometry(0.32, 7.8);
        const yMesh = new THREE.Mesh(yGeo, yellowMat);
        yMesh.rotation.x = -Math.PI / 2;
        yMesh.position.set(0, 0.025, z);
        this.worldGroup.add(yMesh);

        [-5, 5].forEach((lx) => {
          const dashGeo = new THREE.PlaneGeometry(0.18, 3.6);
          const dash = new THREE.Mesh(dashGeo, whiteMat);
          dash.rotation.x = -Math.PI / 2;
          dash.position.set(lx, 0.025, z);
          this.worldGroup.add(dash);
        });

        // Add glossy reflective puddles in Night Rain mode
        if (isWet && Math.abs(z) % 24 === 0) {
          const pGeo = new THREE.CircleGeometry(1.8 + (Math.abs(z) % 3) * 0.5, 14);
          const puddle = new THREE.Mesh(pGeo, puddleMat);
          puddle.rotation.x = -Math.PI / 2;
          puddle.position.set(((z % 5) - 2) * 3.2, 0.026, z);
          this.worldGroup.add(puddle);
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
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf1f5f9 });

      [cz + 12.2, cz - 12.2].forEach((cwZ) => {
        for (let x = -8.8; x <= 8.8; x += 1.4) {
          const sGeo = new THREE.PlaneGeometry(0.75, 3.0);
          const sMesh = new THREE.Mesh(sGeo, stripeMat);
          sMesh.rotation.x = -Math.PI / 2;
          sMesh.position.set(x, 0.03, cwZ);
          this.worldGroup.add(sMesh);
        }
      });

      [-12.2, 12.2].forEach((cwX) => {
        for (let z = cz - 8.8; z <= cz + 8.8; z += 1.4) {
          const sGeo = new THREE.PlaneGeometry(3.0, 0.75);
          const sMesh = new THREE.Mesh(sGeo, stripeMat);
          sMesh.rotation.x = -Math.PI / 2;
          sMesh.position.set(cwX, 0.03, z);
          this.worldGroup.add(sMesh);
        }
      });

      // Stop bar
      const stopGeo = new THREE.PlaneGeometry(9.6, 0.65);
      const stopMesh = new THREE.Mesh(stopGeo, stripeMat);
      stopMesh.rotation.x = -Math.PI / 2;
      stopMesh.position.set(5.0, 0.032, cz + 14.5);
      this.worldGroup.add(stopMesh);

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
      const bGroup = new THREE.Group();
      bGroup.position.set(bx, 0, bz);

      const wallMat = new THREE.MeshPhongMaterial({
        color: baseColorHex,
        specular: 0x334155,
        shininess: 25
      });

      // Main building tower
      const tower = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), wallMat);
      tower.position.set(0, bh / 2, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      bGroup.add(tower);

      // Ground-floor dark stone base plinth
      const plinthMat = new THREE.MeshPhongMaterial({ color: 0x1e293b, shininess: 40 });
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.3, 3.4, bd + 0.3), plinthMat);
      plinth.position.set(0, 1.7, 0);
      bGroup.add(plinth);

      // Storefront glass & colorful awning facing the main avenue (toward X = 0)
      const facingSign = bx > 0 ? -1 : 1;
      const storefrontGlassMat = new THREE.MeshPhongMaterial({
        color: this.weather === 'NIGHT_RAIN' || this.weather === 'DUSK' ? 0xfde68a : 0x7dd3fc,
        emissive: this.weather === 'NIGHT_RAIN' || this.weather === 'DUSK' ? 0x78350f : 0x0c4a6e,
        shininess: 140
      });
      const sfGlass = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.72, 2.2), storefrontGlassMat);
      sfGlass.rotation.y = facingSign * (Math.PI / 2);
      sfGlass.position.set(facingSign * (bw / 2 + 0.18), 1.5, 0);
      bGroup.add(sfGlass);

      const awningColors = [0xdc2626, 0x2563eb, 0x059669, 0xd97706];
      const awningMat = new THREE.MeshLambertMaterial({
        color: awningColors[Math.abs(seed) % awningColors.length]
      });
      const awning = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, bd * 0.76), awningMat);
      awning.position.set(facingSign * (bw / 2 + 0.55), 2.95, 0);
      awning.rotation.z = facingSign * -0.25;
      awning.castShadow = true;
      bGroup.add(awning);

      // Roof cornice ledge & rooftop mechanical penthouse
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.6, 0.5, bd + 0.6), plinthMat);
      cornice.position.set(0, bh + 0.25, 0);
      bGroup.add(cornice);

      const penthouse = new THREE.Mesh(
        new THREE.BoxGeometry(bw * 0.45, 2.6, bd * 0.45),
        new THREE.MeshLambertMaterial({ color: 0x475569 })
      );
      penthouse.position.set(0, bh + 1.5, 0);
      penthouse.castShadow = true;
      bGroup.add(penthouse);

      this.worldGroup.add(bGroup);
      this.addBuildingWindows(bx, bh, bz, bw, bd);
    }

    addBuildingWindows(bx, bh, bz, bw, bd) {
      const isNight = this.weather === 'NIGHT_RAIN' || this.weather === 'DUSK';
      const winMat = new THREE.MeshPhongMaterial({
        color: isNight ? 0xfef08a : 0x93c5fd,
        emissive: isNight ? 0xca8a04 : 0x1e3a8a,
        emissiveIntensity: isNight ? 0.55 : 0.2,
        specular: 0xffffff,
        shininess: 140
      });

      const facingSign = bx > 0 ? -1 : 1;
      for (let y = 5.0; y < bh - 2; y += 3.4) {
        // Front facade (Z+)
        const wFront = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.72, 1.25), winMat);
        wFront.position.set(bx, y, bz + bd / 2 + 0.06);
        this.worldGroup.add(wFront);

        // Avenue-facing facade (X inward)
        const wSide = new THREE.Mesh(new THREE.PlaneGeometry(bd * 0.72, 1.25), winMat);
        wSide.rotation.y = facingSign * (Math.PI / 2);
        wSide.position.set(bx + facingSign * (bw / 2 + 0.06), y, bz);
        this.worldGroup.add(wSide);
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
      const hGroup = new THREE.Group();
      const redMat = new THREE.MeshPhongMaterial({ color: 0xdc2626, shininess: 90 });
      const silverMat = new THREE.MeshPhongMaterial({ color: 0xe2e8f0, shininess: 130 });

      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.75, 12), redMat);
      body.position.set(0, 0.45, 0);
      body.castShadow = true;

      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), redMat);
      dome.position.set(0, 0.82, 0);

      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 10), silverMat);
      nozzle.rotation.z = Math.PI / 2;
      nozzle.position.set(0, 0.58, 0);

      hGroup.add(body, dome, nozzle);
      hGroup.position.set(x, 0, z);
      this.worldGroup.add(hGroup);
    }

    buildCornerBollards(cz) {
      const bollardMat = new THREE.MeshPhongMaterial({ color: 0xfacc15, shininess: 80 });
      [
        [-10.8, cz + 14.5],
        [10.8, cz + 14.5],
        [-10.8, cz - 14.5],
        [10.8, cz - 14.5]
      ].forEach(([bx, bz]) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.9, 10), bollardMat);
        post.position.set(bx, 0.52, bz);
        post.castShadow = true;
        this.worldGroup.add(post);
      });
    }

    /**
     * Builds an overhang urban streetlight with glowing LED luminaire and ground light pool.
     */
    buildStreetlight(x, z) {
      const sGroup = new THREE.Group();
      const sign = x > 0 ? -1 : 1; // Overhangs inward over the road
      const metalMat = new THREE.MeshPhongMaterial({ color: 0x334155, shininess: 80 });

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 7.2, 10), metalMat);
      pole.position.set(0, 3.6, 0);
      pole.castShadow = true;

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.8, 8), metalMat);
      arm.rotation.z = sign * (Math.PI / 2 - 0.22);
      arm.position.set(sign * 1.25, 7.05, 0);

      const isNight = this.weather === 'NIGHT_RAIN' || this.weather === 'DUSK' || this.weather === 'FOG';
      const bulbMat = new THREE.MeshBasicMaterial({
        color: isNight ? 0xfef08a : 0xe2e8f0
      });
      const luminaire = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.14, 0.32), bulbMat);
      luminaire.position.set(sign * 2.45, 7.25, 0);

      sGroup.add(pole, arm, luminaire);

      // Soft warm ground light pool on the asphalt during Dusk / Night Rain / Fog
      if (isNight) {
        const poolGeo = new THREE.CircleGeometry(4.2, 16);
        const poolMat = new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.13
        });
        const pool = new THREE.Mesh(poolGeo, poolMat);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(sign * 3.0, 0.028, 0);
        sGroup.add(pool);
      }

      sGroup.position.set(x, 0, z);
      this.worldGroup.add(sGroup);
    }

    /**
     * Builds a lush multi-sphere urban sidewalk tree inside a concrete planter box.
     */
    buildStreetTree(x, z, seed) {
      const tGroup = new THREE.Group();

      const planter = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.42, 1.4),
        new THREE.MeshLambertMaterial({ color: 0x475569 })
      );
      planter.position.set(0, 0.28, 0);

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.2, 2.4, 10),
        new THREE.MeshLambertMaterial({ color: 0x5c4033 })
      );
      trunk.position.set(0, 1.4, 0);
      trunk.castShadow = true;

      const foliageColors = [0x15803d, 0x166534, 0x14532d, 0x4d7c0f];
      const leafMat = new THREE.MeshLambertMaterial({
        color: foliageColors[Math.abs(seed) % foliageColors.length]
      });

      const crownMain = new THREE.Mesh(new THREE.SphereGeometry(1.35, 12, 10), leafMat);
      crownMain.position.set(0, 3.2, 0);
      crownMain.castShadow = true;

      const crownLeft = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 10), leafMat);
      crownLeft.position.set(-0.55, 2.85, 0.35);
      crownLeft.castShadow = true;

      const crownRight = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 10), leafMat);
      crownRight.position.set(0.55, 2.95, -0.35);
      crownRight.castShadow = true;

      tGroup.add(planter, trunk, crownMain, crownLeft, crownRight);
      tGroup.position.set(x, 0, z);
      this.worldGroup.add(tGroup);
    }

    /**
     * Builds a modern glass Bus Stop Shelter with illuminated ad panel and bench.
     */
    buildBusStop(x, z) {
      const bGroup = new THREE.Group();
      const frameMat = new THREE.MeshPhongMaterial({ color: 0x1e293b, shininess: 90 });
      const glassMat = new THREE.MeshPhongMaterial({
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.45,
        shininess: 140
      });

      // Roof canopy
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 4.2), frameMat);
      roof.position.set(0, 2.65, 0);
      roof.castShadow = true;

      // Back glass wall
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 3.9), glassMat);
      backWall.position.set(x > 0 ? 0.8 : -0.8, 1.4, 0);

      // Illuminated transit poster panel
      const adPanel = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 2.2, 0.12),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      adPanel.position.set(0, 1.4, 2.0);

      // Passenger bench
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.12, 2.2),
        new THREE.MeshLambertMaterial({ color: 0x94a3b8 })
      );
      bench.position.set(x > 0 ? 0.45 : -0.45, 0.62, -0.2);

      bGroup.add(roof, backWall, adPanel, bench);
      bGroup.position.set(x, 0, z);
      this.worldGroup.add(bGroup);
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
