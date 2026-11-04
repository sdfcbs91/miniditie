// Rebuild with scripts/build-water-vendor.sh; classic bundle keeps file:// support.
import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { N8AOPass } from 'n8ao';
window.WaterThreeLib = { THREE, CSM, EffectComposer, N8AOPass };
