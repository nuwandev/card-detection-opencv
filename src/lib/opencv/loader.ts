export const loadOpenCV = (): Promise<void> => {
  return new Promise((resolve) => {
    if ((window as any).cv) {
      resolve();
      return;
    }

    (window as any).Module = {
      onRuntimeInitialized: () => {
        resolve();
      },
    };

    // Load the script if not present
    const script = document.createElement('script');
    script.src = '/opencv.js';
    script.async = true;
    document.body.appendChild(script);
  });
};
