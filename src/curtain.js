const SWEEP_MS = 500;

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function paint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

export function runCurtain(atBlack) {
  const curtain = document.querySelector("#curtain");
  curtain.hidden = false;
  curtain.classList.remove("curtain-held", "curtain-opening");
  curtain.classList.add("curtain-closing");
  return wait(SWEEP_MS)
    .then(() => {
      curtain.classList.remove("curtain-closing");
      curtain.classList.add("curtain-held");
      atBlack();
      return paint();
    })
    .then(() => {
      curtain.classList.remove("curtain-held");
      curtain.classList.add("curtain-opening");
      return wait(SWEEP_MS);
    })
    .then(() => {
      curtain.classList.remove("curtain-closing", "curtain-held", "curtain-opening");
      curtain.hidden = true;
    });
}
