export default {
  root: "src/",
  publicDir: "../public/",
  server: {
    host: true,
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  // resolve:
  // {
  //     alias:
  //     {
  //         'three/examples/jsm': 'three/examples/jsm',
  //         'three/addons': 'three/examples/jsm',
  //         'three/tsl': 'three/webgpu',
  //         'three': 'three/webgpu',
  //     }
  // }
};
