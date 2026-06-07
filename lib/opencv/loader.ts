export const loadOpenCV = (): Promise<void> => {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).cv) {
      resolve();
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
