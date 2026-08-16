// ============================================================================
// Cede el hilo al navegador hasta que haya pintado.
//
// Por qué existe: al tocar "enviar" no pasaba nada durante segundos. La causa
// no era la red ni la IA — era que `compressImage` empieza a trabajar en el
// MISMO turno del hilo principal en que React acaba de recibir el envío. El
// canvas (`drawImage` + `toBlob`) bloquea ese hilo con una foto de 12 MP, así
// que el navegador nunca alcanzaba a dibujar el estado "subiendo": el usuario
// veía el botón intacto y volvía a tocarlo (de ahí también el doble envío).
//
// Un `requestAnimationFrame` seguido de un `setTimeout(0)` garantiza que el
// cuadro se pintó antes de continuar: el rAF corre justo antes de pintar y el
// timeout se resuelve ya en el turno siguiente.
//
// Va SIEMPRE antes de trabajo síncrono pesado que ocurra tras un cambio de
// estado que el usuario debe ver.
// ============================================================================

export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}
