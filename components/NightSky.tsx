"use client";

import { useEffect, useRef } from "react";

// One full-screen triangle pair: procedural sky, stars, and lunar surface.
// No remote textures or animation dependencies.
const fragmentShader = `
  precision highp float;
  uniform vec2 resolution;
  uniform float time;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  float terrain(vec2 p) {
    float n = 0.0, amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      n += amplitude * noise(p);
      p = p * 2.07 + vec2(17.3, 9.2);
      amplitude *= 0.5;
    }
    return n;
  }
  // Sample all three axes to keep the rotating spherical texture seamless.
  float lunarTerrain(vec3 p) {
    return (terrain(p.xy + 8.0) + terrain(p.yz + 19.0) + terrain(p.zx + 31.0)) / 3.0;
  }
  float craters(vec3 surface, vec3 lightDirection) {
    float relief = 0.0;
    // Fixed spherical coordinates keep the craters attached during rotation.
    for (int i = 0; i < 24; i++) {
      float seed = float(i);
      float latitude = hash(vec2(seed, 13.0))*2.0-1.0;
      float longitude = hash(vec2(seed, 29.0))*6.283185;
      float ring = sqrt(1.0-latitude*latitude);
      vec3 centre = vec3(ring*cos(longitude),latitude,ring*sin(longitude));
      float size = mix(0.045,0.24,pow(hash(vec2(seed,47.0)),2.0));
      vec3 offset = surface-centre;
      float distanceToCentre = length(offset)/size;
      if (distanceToCentre < 1.4) {
        float bowl = 1.0-smoothstep(0.15,0.94,distanceToCentre);
        float rim = exp(-pow((distanceToCentre-0.98)/0.105,2.0));
        vec3 tangent = offset-centre*dot(offset,centre);
        float facing = dot(tangent/max(length(tangent),0.0001),lightDirection);
        float wall = exp(-pow((distanceToCentre-0.72)/0.23,2.0));
        relief += -0.19*bowl + 0.15*rim - 0.16*facing*wall;
        relief += 0.035*exp(-distanceToCentre*distanceToCentre*65.0);
      }
    }
    return clamp(relief,-0.38,0.22);
  }
  void main() {
    vec2 px = vUv * resolution;
    vec3 sky = mix(vec3(0.085,0.11,0.31), vec3(0.018,0.03,0.09), smoothstep(0.0,1.0,vUv.y));
    sky += vec3(0.025,0.02,0.08) * exp(-length((vUv-vec2(0.85,0.15))*vec2(1.5,1.0))*3.0);
    float baseRadius = min(clamp(resolution.x * 0.145, 85.0, 230.0), resolution.y * 0.3);
    float radius = baseRadius * (1.0 + 0.025*sin(time*0.055));
    vec2 centre = vec2(resolution.x - baseRadius*0.85, baseRadius*0.88);
    centre += baseRadius * vec2(0.065*sin(time*0.045), 0.05*sin(time*0.06));
    vec2 moon = (px - centre) / radius;
    float d = length(moon);
    sky += vec3(0.21,0.25,0.5) * exp(-d*d*0.6) * 0.42;
    sky += vec3(0.36,0.42,0.65) * exp(-max(d-1.0,0.0)*11.0) * 0.22;

    vec2 cell = floor(px / 48.0);
    vec2 star = (cell + vec2(0.18) + vec2(hash(cell),hash(cell+37.0))*0.64)*48.0;
    float seed = hash(cell + 91.0);
    vec2 delta = px-star;
    float dist = length(delta);
    float pulse = 0.5 + 0.5*sin(time*(0.65+seed*0.8) + seed*60.0);
    float sparkle = 0.25 + 0.75*pow(pulse,2.0);
    float prominent = step(0.91,seed);
    float point = exp(-dist*dist/(0.55+seed*1.2+prominent*0.6));
    float halo = exp(-dist*dist/12.0)*0.16;
    float rays = exp(-abs(delta.x)*3.0-abs(delta.y)*0.65)
               + exp(-abs(delta.y)*3.0-abs(delta.x)*0.65);
    vec3 starColour = mix(vec3(0.61,0.76,1.0),vec3(0.94,0.96,1.0),seed);
    sky += starColour*(point+halo+rays*prominent*pulse*0.35)
         *step(0.8,seed)*sparkle*smoothstep(1.05,1.8,d);

    if (d < 1.015) {
      float z = sqrt(max(0.0,1.0-dot(moon,moon)));
      vec3 normal = normalize(vec3(moon,z));
      float angle = time*0.025;
      float tilt = 0.12*sin(time*0.035);
      vec3 surface = vec3(cos(angle)*normal.x + sin(angle)*normal.z,
                          normal.y, -sin(angle)*normal.x + cos(angle)*normal.z);
      surface.xy = mat2(cos(tilt),-sin(tilt),sin(tilt),cos(tilt))*surface.xy;
      vec3 lightDirection = normalize(vec3(-0.35,0.3,1.0));
      vec3 surfaceLight = vec3(cos(angle)*lightDirection.x + sin(angle)*lightDirection.z,
                              lightDirection.y, -sin(angle)*lightDirection.x + cos(angle)*lightDirection.z);
      surfaceLight.xy = mat2(cos(tilt),-sin(tilt),sin(tilt),cos(tilt))*surfaceLight.xy;
      float maria = smoothstep(0.35,0.62,lunarTerrain(surface*3.8));
      float detail = lunarTerrain(surface*32.0);
      vec3 lunar = mix(vec3(0.91,0.94,1.0),vec3(0.48,0.54,0.7),maria*0.75);
      lunar += (detail-0.5)*0.2;
      lunar += craters(surface,surfaceLight);
      float light = max(dot(normal,lightDirection),0.0);
      lunar *= 0.48 + 0.52*light;
      sky = mix(sky,lunar,1.0-smoothstep(0.985,1.012,d));
    }
    gl_FragColor = vec4(sky, 1.0);
  }
`;

export function NightSky() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    let loading = false;

    async function syncTheme() {
      const dark = document.documentElement.dataset.theme !== "light";
      if (!dark) { cleanup?.(); cleanup = undefined; return; }
      if (cleanup || loading) return;
      loading = true;
      try {
        const THREE = await import("three");
        if (disposed || !host.current || document.documentElement.dataset.theme === "light") return;
        const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.ShaderMaterial({
          uniforms: { resolution: { value: new THREE.Vector2() }, time: { value: 0 } },
          vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
          fragmentShader,
          depthTest: false,
          depthWrite: false,
        });
        scene.add(new THREE.Mesh(geometry, material));
        host.current.appendChild(renderer.domElement);
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
        let frame = 0;
        let last = 0;
        function render(now: number) {
          frame = 0;
          if (document.hidden) return;
          if (now - last >= 1000 / 24 || reduced.matches) {
            material.uniforms.time.value = reduced.matches ? 0 : now / 1000;
            renderer.render(scene, camera);
            last = now;
          }
          if (!reduced.matches) frame = requestAnimationFrame(render);
        }
        function resume() {
          cancelAnimationFrame(frame);
          last = -Infinity;
          render(performance.now());
        }
        function resize() {
          renderer.setSize(window.innerWidth, window.innerHeight);
          material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
          resume();
        }
        function lost(event: Event) { event.preventDefault(); cancelAnimationFrame(frame); }
        renderer.domElement.addEventListener("webglcontextlost", lost);
        renderer.domElement.addEventListener("webglcontextrestored", resume);
        window.addEventListener("resize", resize);
        document.addEventListener("visibilitychange", resume);
        reduced.addEventListener("change", resume);
        resize();
        cleanup = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener("resize", resize);
          document.removeEventListener("visibilitychange", resume);
          reduced.removeEventListener("change", resume);
          renderer.domElement.removeEventListener("webglcontextlost", lost);
          renderer.domElement.removeEventListener("webglcontextrestored", resume);
          geometry.dispose();
          material.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch {
        // The CSS gradient remains available when WebGL is unsupported.
      } finally { loading = false; }
    }
    const observer = new MutationObserver(() => { void syncTheme(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    void syncTheme();
    return () => { disposed = true; observer.disconnect(); cleanup?.(); };
  }, []);

  return <div ref={host} className="night-sky" aria-hidden="true" />;
}
