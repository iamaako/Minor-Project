'use strict';

/**
 * gaze.js — Pure head-pose + eye-gaze math for the webcam proctor.
 *
 * Input comes from MediaPipe Face Landmarker (478 landmarks, 10 of them iris,
 * plus ARKit-style blendshapes). No DOM access here, so it can be unit-tested
 * in plain Node (see module.exports at the bottom).
 *
 * Conventions (important):
 *   - Landmarks are NORMALISED image coordinates of the UNMIRRORED camera frame.
 *   - Every horizontal angle/ratio is "positive = towards image-right",
 *     which is the STUDENT'S LEFT. side 'LEFT' / 'RIGHT' below always means
 *     the student's own left / right.
 */
(function (root) {
  const LM = {
    NOSE_TIP: 1,
    EYE_MID: 168,
    CHIN: 152,
    CHEEK_A: 234,
    CHEEK_B: 454,
    // Image-left eye (student's right eye)
    EYE_A_OUTER: 33, EYE_A_INNER: 133, IRIS_A: 468,
    // Image-right eye (student's left eye)
    EYE_B_INNER: 362, EYE_B_OUTER: 263, IRIS_B: 473,
  };

  // Tunable thresholds. Values are starting points that need checking on real students.
  const DEFAULTS = {
    // Iris offset inside the eye socket -> degrees of eyeball rotation (empirical).
    EYE_DEG_PER_UNIT: 150,
    // Combined (head + eyes) horizontal angle beyond which the student looks aside.
    HORIZ_AWAY_DEG: 30,
    // Head pitch delta (nose/eye/chin ratio) that counts as head bowed down.
    HEAD_DOWN_DELTA: 0.10,
    // Eye-down blendshape delta that counts as eyes pointing down.
    EYE_DOWN_DELTA: 0.35,
    // Below this normalised face width the iris is too small to measure.
    MIN_FACE_WIDTH_FOR_GAZE: 0.10,
    BLINK_SCORE: 0.5,
  };

  const RAD2DEG = 180 / Math.PI;

  function _bsMap(categories) {
    const m = {};
    if (Array.isArray(categories)) {
      for (const c of categories) m[c.categoryName] = c.score;
    }
    return m;
  }

  function _irisRatio(lm, iris, a, b) {
    const span = lm[b].x - lm[a].x;
    if (Math.abs(span) < 1e-6) return null;
    return (lm[iris].x - lm[a].x) / span;
  }

  /**
   * @param {Array<{x:number,y:number,z:number}>} lm  478 landmarks
   * @param {Array<{categoryName:string,score:number}>} [blendshapes]
   * @returns raw per-frame metrics
   */
  function analyze(lm, blendshapes) {
    const nose = lm[LM.NOSE_TIP];
    const a = lm[LM.CHEEK_A];
    const b = lm[LM.CHEEK_B];
    const faceWidth = Math.abs(b.x - a.x);

    // Head yaw: nose offset from the contour midpoint. For a nose that sticks out
    // ~half a face-width, offset = 0.5 * tan(yaw)  =>  yaw = atan(2 * offset).
    const offset = (nose.x - (a.x + b.x) / 2) / (faceWidth + 1e-6);
    const yawDeg = Math.atan(2 * offset) * RAD2DEG;

    // Head pitch: where the nose tip sits between the brow line and the chin.
    // Bowing the head down pushes the protruding nose down in the image => ratio grows.
    const eyeMid = lm[LM.EYE_MID];
    const chin = lm[LM.CHIN];
    const pitchRatio = (nose.y - eyeMid.y) / ((chin.y - eyeMid.y) + 1e-6);

    const bs = _bsMap(blendshapes);
    const blink = ((bs.eyeBlinkLeft || 0) + (bs.eyeBlinkRight || 0)) / 2;
    const eyeDown = ((bs.eyeLookDownLeft || 0) + (bs.eyeLookDownRight || 0)) / 2;

    // Horizontal iris position, 0 = iris at image-left corner, 1 = image-right corner.
    let gazeH = null;
    if (lm.length >= 478 && faceWidth >= DEFAULTS.MIN_FACE_WIDTH_FOR_GAZE && blink < DEFAULTS.BLINK_SCORE) {
      const rA = _irisRatio(lm, LM.IRIS_A, LM.EYE_A_OUTER, LM.EYE_A_INNER);
      const rB = _irisRatio(lm, LM.IRIS_B, LM.EYE_B_INNER, LM.EYE_B_OUTER);
      const vals = [rA, rB].filter((v) => v !== null && isFinite(v));
      if (vals.length) gazeH = vals.reduce((s, v) => s + v, 0) / vals.length;
    }

    return { yawDeg, pitchRatio, gazeH, eyeDown, blink, faceWidth };
  }

  /**
   * Compare metrics to the student's calibrated "looking at screen" baseline.
   * @returns {{state:'CENTER'|'LEFT'|'RIGHT'|'DOWN', worldYawDeg:number,
   *            headYawDeg:number, eyeYawDeg:number, cause:string, down:boolean}}
   */
  function classify(m, baseline, cfg) {
    const c = Object.assign({}, DEFAULTS, cfg || {});
    const base = baseline || { yawDeg: 0, pitchRatio: null, gazeH: 0.5, eyeDown: 0 };

    const headYawDeg = m.yawDeg - base.yawDeg;
    const eyeYawDeg = m.gazeH === null || m.gazeH === undefined
      ? 0
      : (m.gazeH - base.gazeH) * c.EYE_DEG_PER_UNIT;
    const worldYawDeg = headYawDeg + eyeYawDeg;

    const headDown = base.pitchRatio !== null && base.pitchRatio !== undefined &&
      (m.pitchRatio - base.pitchRatio) > c.HEAD_DOWN_DELTA;
    const eyesDown = (m.eyeDown - base.eyeDown) > c.EYE_DOWN_DELTA;
    const down = headDown || eyesDown;

    let state = 'CENTER';
    let cause = 'NONE';
    if (Math.abs(worldYawDeg) > c.HORIZ_AWAY_DEG) {
      state = worldYawDeg > 0 ? 'LEFT' : 'RIGHT';
      const h = Math.abs(headYawDeg);
      const e = Math.abs(eyeYawDeg);
      cause = (h >= 15 && e >= 10) ? 'HEAD+EYES' : (h >= e ? 'HEAD' : 'EYES');
    } else if (down) {
      state = 'DOWN';
      cause = headDown && eyesDown ? 'HEAD+EYES' : (headDown ? 'HEAD' : 'EYES');
    }

    return { state, worldYawDeg, headYawDeg, eyeYawDeg, cause, down };
  }

  const api = { LM, DEFAULTS, analyze, classify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ProctorGaze = api;
})(typeof window !== 'undefined' ? window : globalThis);
