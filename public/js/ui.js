let renderPage;
export function setRenderer(render) {
  renderPage = render;
}
export function render() {
  return renderPage();
}
