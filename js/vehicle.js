/**
 * Emergency Crossroad Simulator — Player Vehicle, Sculpted Cockpit & 4-Camera Mirror Rig
 * Includes bevel-extruded aerodynamic hood, windshield wipers, curved A-pillars,
 * Police Interceptor push-bar, flashing roof strobe point lights, and articulated
 * 3D back-cabin interior (stretcher, patient, paramedic, IV bag, or suspect cage).
 */
(function () {
  class PlayerEmergencyVehicle {
    constructor(scene) {
      this.scene = scene;
      this.root = new THREE.Group();
      this.scene.add(this.root);

      // Cameras:
      this.driverCamera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.2, 420);
      this.leftMirrorCamera = new THREE.PerspectiveCamera(48, 215 / 120, 0.3, 180);
      this.rightMirrorCamera = new THREE.PerspectiveCamera(48, 215 / 120, 0.3, 180);
      this.rearMirrorCamera = new THREE.PerspectiveCamera(52, 350 / 95, 0.3, 200);
      this.cabinCamera = new THREE.PerspectiveCamera(60, 350 / 95, 0.1, 15);

      this.root.add(
        this.driverCamera,
        this.leftMirrorCamera,
        this.rightMirrorCamera,
        this.rearMirrorCamera,
        this.cabinCamera
      );

      // Emergency strobe point lights mounted on the roof
      this.redStrobeLight = new THREE.PointLight(0xff1e38, 0, 35, 1.6);
      this.blueStrobeLight = new THREE.PointLight(0x2997ff, 0, 35, 1.6);
      this.redStrobeLight.position.set(-0.75, 2.75, -0.5);
      this.blueStrobeLight.position.set(0.75, 2.75, -0.5);
      this.root.add(this.redStrobeLight, this.blueStrobeLight);

      this.chassisGroup = new THREE.Group();
      this.root.add(this.chassisGroup);

      this.passengerGroup = null;
      this.attendantGroup = null;

      this.vehicleType = 'AMBULANCE';
      this.x = 5.0;
      this.z = 30.0;
      this.heading = 0;
      this.speedMs = 0;
      this.steerAngle = 0;
      this.lookAngleTarget = 0;
      this.lookAngleCurrent = 0;

      this.longitudinalG = 0;
      this.lateralG = 0;
      this.totalG = 0;
      this.stability = 100;
      this.bpm = 88;
      this.strobesOn = true;
      this.showCabinInCenterMirror = false;

      this.halfW = 1.2;
      this.halfL = 3.0;
      this.maxSpeedMs = 30;
      this.accelRate = 11;
      this.brakeRate = 22;
      this.steerSpeed = 1.6;
      this.cabinSensitivity = 1.0;
    }

    configure(vehicleType, weather) {
      this.vehicleType = vehicleType;
      this.x = 5.0;
      this.z = 32.0;
      this.heading = 0;
      this.speedMs = 10.0;
      this.steerAngle = 0;
      this.lookAngleCurrent = 0;
      this.stability = 100;
      this.bpm = vehicleType === 'AMBULANCE' ? 92 : 84;
      this.totalG = 0.1;

      const wetMultiplier = weather === 'NIGHT_RAIN' ? 0.76 : 1.0;

      if (vehicleType === 'AMBULANCE') {
        this.halfW = 1.25;
        this.halfL = 3.1;
        this.maxSpeedMs = 29;
        this.accelRate = 10.5;
        this.brakeRate = 21 * wetMultiplier;
        this.steerSpeed = 1.45;
        this.cabinSensitivity = 1.35;
        this.driverCamera.position.set(-0.45, 1.95, -0.4);
      } else if (vehicleType === 'FIRETRUCK') {
        this.halfW = 1.45;
        this.halfL = 4.5;
        this.maxSpeedMs = 25;
        this.accelRate = 7.8;
        this.brakeRate = 15.5 * wetMultiplier;
        this.steerSpeed = 1.12;
        this.cabinSensitivity = 0.85;
        this.driverCamera.position.set(-0.55, 2.35, -0.6);
      } else {
        this.halfW = 1.1;
        this.halfL = 2.4;
        this.maxSpeedMs = 37;
        this.accelRate = 15.5;
        this.brakeRate = 26 * wetMultiplier;
        this.steerSpeed = 1.85;
        this.cabinSensitivity = 1.0;
        this.driverCamera.position.set(-0.42, 1.52, -0.35);
      }

      const camY = this.driverCamera.position.y - 0.1;
      this.leftMirrorCamera.position.set(-this.halfW - 0.15, camY, -0.9);
      this.leftMirrorCamera.rotation.set(-0.04, Math.PI + 0.18, 0, 'YXZ');

      this.rightMirrorCamera.position.set(this.halfW + 0.15, camY, -0.9);
      this.rightMirrorCamera.rotation.set(-0.04, Math.PI - 0.18, 0, 'YXZ');

      this.rearMirrorCamera.position.set(0, camY + 0.25, 3.2);
      this.rearMirrorCamera.rotation.set(-0.03, Math.PI, 0, 'YXZ');

      this.cabinCamera.position.set(0, 2.05, 0.35);
      this.cabinCamera.rotation.set(-0.18, Math.PI, 0, 'YXZ');

      this.buildCockpitAndCabinMesh(vehicleType);
    }

    buildSculptedHoodGeo(width, length) {
      const shape = new THREE.Shape();
      shape.moveTo(-length, -0.26);
      shape.lineTo(-length - 0.08, -0.05);
      shape.lineTo(-length + 0.2, 0.08);
      shape.lineTo(0, 0.18);
      shape.lineTo(0, -0.26);
      shape.closePath();

      const geo = new THREE.ExtrudeGeometry(shape, {
        steps: 1,
        depth: width - 0.24,
        bevelEnabled: true,
        bevelThickness: 0.12,
        bevelSize: 0.1,
        bevelSegments: 5
      });
      geo.rotateY(-Math.PI / 2);
      geo.computeBoundingBox();
      const cx = (geo.boundingBox.max.x + geo.boundingBox.min.x) / 2;
      geo.translate(-cx, 0, 0);
      geo.computeVertexNormals();
      return geo;
    }

    buildCockpitAndCabinMesh(vehicleType) {
      while (this.chassisGroup.children.length > 0) {
        this.chassisGroup.remove(this.chassisGroup.children[0]);
      }
      if (this.cabinInteriorGroup) {
        this.root.remove(this.cabinInteriorGroup);
        this.cabinInteriorGroup = null;
      }

      let hoodColor = 0xf8fafc;
      let stripeColor = 0xef4444;
      if (vehicleType === 'FIRETRUCK') {
        hoodColor = 0xdc2626;
        stripeColor = 0xfacc15;
      } else if (vehicleType === 'POLICE') {
        hoodColor = 0x111827;
        stripeColor = 0x3b82f6;
      }

      const hoodMat = new THREE.MeshPhongMaterial({
        color: hoodColor,
        specular: 0xffffff,
        shininess: 120
      });

      // 1. Sculpted Aerodynamic Front Hood & Fender Ridges
      const hoodY = this.driverCamera.position.y - 0.62;
      const hoodGeo = this.buildSculptedHoodGeo(this.halfW * 1.9, 1.95);
      const hood = new THREE.Mesh(hoodGeo, hoodMat);
      hood.position.set(0, hoodY, -0.95);
      this.chassisGroup.add(hood);

      // Raised center power-dome crease & emergency livery stripe
      const domeGeo = new THREE.CylinderGeometry(0.38, 0.52, 1.65, 16);
      domeGeo.rotateX(Math.PI / 2);
      domeGeo.scale(1.4, 0.18, 1.0);
      const dome = new THREE.Mesh(domeGeo, new THREE.MeshPhongMaterial({ color: stripeColor, shininess: 110 }));
      dome.position.set(0, hoodY + 0.13, -1.82);
      this.chassisGroup.add(dome);

      // Windshield Wipers at base of windshield
      const wiperMat = new THREE.MeshPhongMaterial({ color: 0x0f172a, shininess: 60 });
      [-0.45, 0.35].forEach((wx) => {
        const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.68, 8), wiperMat);
        blade.rotation.z = Math.PI / 2 - 0.12;
        blade.position.set(wx, hoodY + 0.21, -1.02);
        this.chassisGroup.add(blade);
      });

      // Police Heavy-Duty Push Bumper / Bullbar visible over nose
      if (vehicleType === 'POLICE') {
        const barMat = new THREE.MeshPhongMaterial({ color: 0x1f2937, specular: 0x9ca3af, shininess: 90 });
        [-0.38, 0.38].forEach((bx) => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 12), barMat);
          post.position.set(bx, hoodY + 0.06, -2.92);
          this.chassisGroup.add(post);
        });
        const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.84, 12), barMat);
        crossbar.rotation.z = Math.PI / 2;
        crossbar.position.set(0, hoodY + 0.22, -2.92);
        this.chassisGroup.add(crossbar);
      }

      // 2. Curved Tubular Windshield A-Pillars & Exterior Wing Mirror Pods
      const pillarMat = new THREE.MeshPhongMaterial({ color: 0x0f172a, shininess: 50 });
      [-1, 1].forEach((side) => {
        const pGeo = new THREE.CylinderGeometry(0.055, 0.07, 1.35, 12);
        const pillar = new THREE.Mesh(pGeo, pillarMat);
        pillar.position.set(side * (this.halfW - 0.06), this.driverCamera.position.y, -1.12);
        pillar.rotation.z = side * -0.14;
        pillar.rotation.x = 0.28;
        this.chassisGroup.add(pillar);
      });

      // 3. Detailed 3D Back Cabin Interior (rendered ONLY in Center Cabin Mirror)
      const cabinBox = new THREE.Group();
      cabinBox.position.set(0, 1.4, 2.1);
      cabinBox.visible = false;
      this.cabinInteriorGroup = cabinBox;

      const cabinLight = new THREE.PointLight(0xe0f2fe, 0.95, 6);
      cabinLight.position.set(0, 0.85, -0.5);
      cabinBox.add(cabinLight);

      const wallMat = new THREE.MeshLambertMaterial({ color: 0x334155, side: THREE.BackSide });
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.8, 3.2), wallMat);
      cabinBox.add(hull);

      this.passengerGroup = new THREE.Group();
      this.attendantGroup = new THREE.Group();

      if (vehicleType === 'AMBULANCE') {
        // Tubular stretcher bed with orange cushioned mattress
        const mattress = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.36, 1.88, 16),
          new THREE.MeshPhongMaterial({ color: 0xf97316, shininess: 40 })
        );
        mattress.rotation.x = Math.PI / 2;
        mattress.scale.set(1.0, 0.35, 1.0);
        mattress.position.set(-0.25, -0.35, 0);
        cabinBox.add(mattress);

        // Articulated Trauma Patient on stretcher (sculpted head, torso under blanket, arms)
        const blanket = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.28, 1.22, 16),
          new THREE.MeshPhongMaterial({ color: 0x38bdf8, shininess: 30 })
        );
        blanket.rotation.x = Math.PI / 2;
        blanket.scale.set(1.0, 0.55, 1.0);
        blanket.position.set(0, 0.12, 0.22);

        const pHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 16, 16),
          new THREE.MeshLambertMaterial({ color: 0xfde68a })
        );
        pHead.position.set(0, 0.28, -0.52);

        // Oxygen mask on patient
        const mask = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 10, 10),
          new THREE.MeshPhongMaterial({ color: 0x86efac, transparent: true, opacity: 0.75 })
        );
        mask.position.set(0, 0.42, -0.48);

        this.passengerGroup.add(blanket, pHead, mask);
        this.passengerGroup.position.set(-0.25, -0.2, 0);
        cabinBox.add(this.passengerGroup);

        // Paramedic Attendant with rounded scrub torso, head & stethoscope
        const medicTorso = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.19, 0.72, 14),
          new THREE.MeshPhongMaterial({ color: 0x16a34a })
        );
        const medicHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.19, 14, 14),
          new THREE.MeshLambertMaterial({ color: 0xfed7aa })
        );
        medicHead.position.set(0, 0.52, 0);
        this.attendantGroup.add(medicTorso, medicHead);
        this.attendantGroup.position.set(0.55, -0.05, -0.1);
        cabinBox.add(this.attendantGroup);
      } else if (vehicleType === 'FIRETRUCK') {
        [-0.5, 0.5].forEach((cx) => {
          const ff = new THREE.Mesh(
            new THREE.CylinderGeometry(0.24, 0.21, 0.78, 14),
            new THREE.MeshPhongMaterial({ color: 0xd97706 })
          );
          ff.position.set(cx, -0.1, 0.1);
          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 14, 14),
            new THREE.MeshLambertMaterial({ color: 0xfde68a })
          );
          head.position.set(cx, 0.42, 0.1);
          const helmet = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
            new THREE.MeshPhongMaterial({ color: 0xfacc15, shininess: 120 })
          );
          helmet.position.set(cx, 0.46, 0.1);
          this.passengerGroup.add(ff, head, helmet);
        });
        cabinBox.add(this.passengerGroup);
      } else {
        // POLICE: Suspect behind steel mesh divider bars
        for (let bx = -0.8; bx <= 0.8; bx += 0.2) {
          const bar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.015, 1.2, 8),
            new THREE.MeshPhongMaterial({ color: 0x94a3b8 })
          );
          bar.position.set(bx, 0.2, -0.45);
          cabinBox.add(bar);
        }

        const suspectTorso = new THREE.Mesh(
          new THREE.CylinderGeometry(0.23, 0.19, 0.75, 14),
          new THREE.MeshPhongMaterial({ color: 0xf97316 })
        );
        const suspectHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 14, 14),
          new THREE.MeshLambertMaterial({ color: 0xfde68a })
        );
        suspectHead.position.set(0, 0.55, 0);
        this.passengerGroup.add(suspectTorso, suspectHead);
        this.passengerGroup.position.set(0, -0.1, 0.15);
        cabinBox.add(this.passengerGroup);
      }

      this.root.add(cabinBox);
    }

    update(dt, input, audioEngine) {
      const prevSpeed = this.speedMs;

      if (input.forward) {
        this.speedMs = Math.min(this.maxSpeedMs, this.speedMs + this.accelRate * dt);
      } else if (input.brake) {
        if (this.speedMs > 0.2) {
          this.speedMs = Math.max(0, this.speedMs - this.brakeRate * dt);
        } else {
          this.speedMs = Math.max(-6, this.speedMs - 6 * dt);
        }
      } else {
        if (this.speedMs > 0) this.speedMs = Math.max(0, this.speedMs - 3.2 * dt);
        else if (this.speedMs < 0) this.speedMs = Math.min(0, this.speedMs + 4.0 * dt);
      }

      const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      if (steerInput !== 0) {
        this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, steerInput * 0.65, dt * 7);
      } else {
        this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, 0, dt * 9);
      }

      const speedFactor = Math.min(1.0, Math.abs(this.speedMs) / 5.5);
      const angularVel = this.steerAngle * this.steerSpeed * speedFactor * (this.speedMs >= 0 ? 1 : -1);
      this.heading += angularVel * dt;
      this.heading = THREE.MathUtils.clamp(this.heading, -1.15, 1.15);

      if (steerInput === 0 && Math.abs(this.heading) < 0.35) {
        this.heading = THREE.MathUtils.lerp(this.heading, 0, dt * 1.8);
      }

      this.x -= Math.sin(this.heading) * this.speedMs * dt;
      this.z -= Math.cos(this.heading) * this.speedMs * dt;

      if (this.x < -9.4) {
        this.x = -9.4;
        this.heading *= 0.5;
      } else if (this.x > 9.4) {
        this.x = 9.4;
        this.heading *= 0.5;
      }

      const accelMs2 = (this.speedMs - prevSpeed) / Math.max(0.001, dt);
      this.longitudinalG = Math.abs(accelMs2) / 9.81;
      this.lateralG = Math.abs(this.speedMs * angularVel) / 9.81;
      const instantG = Math.hypot(this.longitudinalG * 0.85, this.lateralG * 1.25);
      this.totalG = THREE.MathUtils.lerp(this.totalG, instantG, dt * 8);

      if (accelMs2 < -13.5 && this.speedMs > 4) {
        this.stability = Math.max(0, this.stability - dt * 16 * this.cabinSensitivity);
        this.bpm = Math.min(168, this.bpm + dt * 28);
        audioEngine.playBrakeScreech(this.longitudinalG);
        audioEngine.triggerCabinVocal('HARD_BRAKE');
      } else if (this.lateralG > 0.72 && this.speedMs > 8) {
        this.stability = Math.max(0, this.stability - dt * 13 * this.cabinSensitivity);
        this.bpm = Math.min(165, this.bpm + dt * 22);
        audioEngine.triggerCabinVocal('SHARP_SWERVE');
      } else {
        this.stability = Math.min(100, this.stability + dt * 1.2);
        const targetBpm = 88 + (100 - this.stability) * 0.65;
        this.bpm = THREE.MathUtils.lerp(this.bpm, targetBpm, dt * 1.5);
      }

      this.root.position.set(this.x, 0, this.z);
      this.root.rotation.y = this.heading;

      if (input.lookLeft) this.lookAngleTarget = 1.22;
      else if (input.lookRight) this.lookAngleTarget = -1.22;
      else this.lookAngleTarget = 0;

      this.lookAngleCurrent = THREE.MathUtils.lerp(this.lookAngleCurrent, this.lookAngleTarget, dt * 10);


      const bodyRoll = THREE.MathUtils.clamp(-angularVel * this.speedMs * 0.0035, -0.07, 0.07);

      this.driverCamera.rotation.order = 'YXZ';
      this.driverCamera.rotation.y = this.lookAngleCurrent;
      this.driverCamera.rotation.x = 0;
      this.driverCamera.rotation.z = bodyRoll;

      if (this.passengerGroup) {
        const joltX = THREE.MathUtils.clamp(-angularVel * 0.22, -0.28, 0.28);
        const shake = this.totalG > 0.8 ? Math.sin(performance.now() * 0.04) * 0.08 : 0;
        this.passengerGroup.position.x = (this.vehicleType === 'AMBULANCE' ? -0.25 : 0) + joltX + shake;
        this.passengerGroup.rotation.z = joltX * 1.2;
      }

      if (this.strobesOn) {
        const phase = Math.floor(performance.now() / 160) % 2;
        this.redStrobeLight.intensity = phase === 0 ? 2.4 : 0.15;
        this.blueStrobeLight.intensity = phase === 1 ? 2.4 : 0.15;
      } else {
        this.redStrobeLight.intensity = 0;
        this.blueStrobeLight.intensity = 0;
      }
    }
  }

  window.PlayerEmergencyVehicle = PlayerEmergencyVehicle;
})();
