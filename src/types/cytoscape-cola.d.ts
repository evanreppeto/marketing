// cytoscape-cola ships no types; it's a cytoscape layout extension registered
// via cytoscape.use(). We only need the default export to exist.
declare module "cytoscape-cola" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ext: any;
  export default ext;
}
