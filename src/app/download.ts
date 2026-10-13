import { localDate } from '@/lib/report';

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoke after the click has been handled
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** e.g. "slayer-cloud-infrastructure-2026-10-14.md" */
export const exportFilename = (name: string, extension: string, date = new Date()) => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';
  return `slayer-${slug}-${localDate(date)}.${extension}`;
};

/** Rasterises a standalone SVG string to PNG at the given scale. */
export const svgToPngBlob = (svg: string, scale = 2): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(image.width * scale);
      canvas.height = Math.ceil(image.height * scale);
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas is not supported'));
        return;
      }
      context.scale(scale, scale);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not render the diagram'));
    };
    image.src = url;
  });

/**
 * Opens the browser print dialog for a standalone HTML document, from which
 * it can be saved as PDF. Uses a hidden iframe so no popup is needed.
 */
export const printHtml = (html: string) => {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    win.addEventListener('afterprint', () => frame.remove());
    win.focus();
    win.print();
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
};
