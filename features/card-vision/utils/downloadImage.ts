export function downloadImage(
  url: string,
  filenamePrefix = "captured-card",
): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filenamePrefix}-${Date.now()}.jpg`;
  document.body.append(link);
  link.click();
  link.remove();
}