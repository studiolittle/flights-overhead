"use client";

import { useEffect, useRef } from "react";

// One full-screen triangle pair: procedural night sky and stars.
// No remote textures or animation dependencies.
const fragmentShader = `
  precision highp float;
  uniform vec2 resolution;
  uniform float time;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 px = vUv * resolution;
    vec3 sky = mix(vec3(0.085,0.11,0.31), vec3(0.018,0.03,0.09), smoothstep(0.0,1.0,vUv.y));
    sky += vec3(0.025,0.02,0.08) * exp(-length((vUv-vec2(0.85,0.15))*vec2(1.5,1.0))*3.0);

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
         *step(0.8,seed)*sparkle;
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
            if (host.current) host.current.dataset.skyReady = "true";
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
        if (host.current) host.current.dataset.skyReady = "true";
      } finally { loading = false; }
    }
    const observer = new MutationObserver(() => { void syncTheme(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    void syncTheme();
    return () => { disposed = true; observer.disconnect(); cleanup?.(); };
  }, []);

  return <><div ref={host} className="night-sky" aria-hidden="true" /><div className="day-sky" aria-hidden="true">
    {Array.from({ length: 14 }, (_, i) => <span key={i} style={{ left: `${(i * 37 + 7) % 100}%`, top: `${(i * 23 + 11) % 100}%`, width: i % 3 === 0 ? 5 : 3, height: i % 3 === 0 ? 5 : 3, animationDelay: `${-i * 2.7}s`, animationDuration: `${24 + i % 5 * 4}s` }} />)}
  </div></>;
}
