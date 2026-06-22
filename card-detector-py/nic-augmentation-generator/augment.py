import argparse
import csv
import random
import shutil
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


INPUTS_DIR = Path("inputs")
OUTPUTS_DIR = Path("outputs")
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


@dataclass(frozen=True)
class OutputRecord:
    split: str
    label: str
    original_file: str
    output_file: str
    is_augmented: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate realistic NIC / NOT_NIC image augmentations."
    )
    parser.add_argument(
        "--label",
        choices=["nic", "not_nic"],
        default="nic",
        help="Class label for all images currently in inputs/.",
    )
    parser.add_argument(
        "--augmentations",
        type=int,
        default=30,
        help="Number of augmented images to generate per original image.",
    )
    parser.add_argument(
        "--val-ratio",
        type=float,
        default=0.2,
        help="Fraction of original images reserved for validation before augmentation.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed used for reproducible train/validation splits.",
    )
    parser.add_argument(
        "--no-originals",
        action="store_true",
        help="Do not copy original images into the output dataset.",
    )
    return parser.parse_args()


def ensure_directories(label: str) -> None:
    INPUTS_DIR.mkdir(exist_ok=True)
    for split in ("train", "val"):
        (OUTPUTS_DIR / split / label).mkdir(parents=True, exist_ok=True)


def list_input_files() -> tuple[list[Path], list[Path]]:
    files = [path for path in sorted(INPUTS_DIR.iterdir()) if path.is_file()]
    images = [path for path in files if path.suffix.lower() in SUPPORTED_EXTENSIONS]
    skipped = [path for path in files if path.suffix.lower() not in SUPPORTED_EXTENSIONS]
    return images, skipped


def split_originals(images: list[Path], val_ratio: float, seed: int) -> dict[str, list[Path]]:
    if not images:
        return {"train": [], "val": []}

    shuffled = images[:]
    random.Random(seed).shuffle(shuffled)

    if len(shuffled) == 1:
        return {"train": shuffled, "val": []}

    val_count = round(len(shuffled) * val_ratio)
    val_count = max(1, min(val_count, len(shuffled) - 1))

    return {
        "train": shuffled[val_count:],
        "val": shuffled[:val_count],
    }


def read_image(path: Path) -> np.ndarray | None:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        return None
    return image


def output_extension(source: Path) -> str:
    if source.suffix.lower() in {".jpg", ".jpeg"}:
        return ".jpg"
    return ".png"


def write_image(path: Path, image: np.ndarray) -> bool:
    params = []
    if path.suffix.lower() in {".jpg", ".jpeg"}:
        params = [cv2.IMWRITE_JPEG_QUALITY, 92]
    return bool(cv2.imwrite(str(path), image, params))


def copy_original(source: Path, destination: Path) -> bool:
    try:
        shutil.copy2(source, destination)
        return True
    except OSError:
        return False


def apply_affine(image: np.ndarray, rng: random.Random) -> np.ndarray:
    h, w = image.shape[:2]
    angle = rng.uniform(-3.0, 3.0)
    scale = rng.uniform(0.97, 1.03)
    tx = rng.uniform(-0.01, 0.01) * w
    ty = rng.uniform(-0.01, 0.01) * h

    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, scale)
    matrix[0, 2] += tx
    matrix[1, 2] += ty

    return cv2.warpAffine(
        image,
        matrix,
        (w, h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT_101,
    )


def apply_perspective(image: np.ndarray, rng: random.Random) -> np.ndarray:
    h, w = image.shape[:2]
    max_dx = w * rng.uniform(0.01, 0.03)
    max_dy = h * rng.uniform(0.01, 0.03)

    src = np.float32([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]])
    dst = np.float32(
        [
            [rng.uniform(0, max_dx), rng.uniform(0, max_dy)],
            [w - 1 - rng.uniform(0, max_dx), rng.uniform(0, max_dy)],
            [w - 1 - rng.uniform(0, max_dx), h - 1 - rng.uniform(0, max_dy)],
            [rng.uniform(0, max_dx), h - 1 - rng.uniform(0, max_dy)],
        ]
    )
    matrix = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(
        image,
        matrix,
        (w, h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT_101,
    )


def apply_lighting(image: np.ndarray, rng: random.Random) -> np.ndarray:
    contrast = rng.uniform(0.75, 1.25)
    brightness = rng.uniform(-76, 76)
    adjusted = cv2.convertScaleAbs(image, alpha=contrast, beta=brightness)

    if rng.random() < 0.45:
        gamma = rng.uniform(0.8, 1.25)
        table = np.array(
            [((i / 255.0) ** (1.0 / gamma)) * 255 for i in range(256)],
            dtype=np.uint8,
        )
        adjusted = cv2.LUT(adjusted, table)

    return adjusted


def apply_blur(image: np.ndarray, rng: random.Random) -> np.ndarray:
    if rng.random() >= 0.1:
        return image

    kernel_size = rng.choice([3, 5])
    if rng.random() < 0.5:
        return cv2.GaussianBlur(image, (kernel_size, kernel_size), 0)

    kernel = np.zeros((kernel_size, kernel_size), dtype=np.float32)
    if rng.random() < 0.5:
        kernel[kernel_size // 2, :] = 1.0
    else:
        kernel[:, kernel_size // 2] = 1.0
    kernel /= kernel_size
    return cv2.filter2D(image, -1, kernel)


def apply_noise(image: np.ndarray, rng: random.Random) -> np.ndarray:
    if rng.random() >= 0.15:
        return image

    sigma = rng.uniform(3.0, 12.0)
    noise = np.random.default_rng(rng.randrange(1_000_000_000)).normal(
        0,
        sigma,
        image.shape,
    )
    noisy = image.astype(np.float32) + noise
    return np.clip(noisy, 0, 255).astype(np.uint8)


def apply_jpeg_compression(image: np.ndarray, rng: random.Random) -> np.ndarray:
    if rng.random() >= 0.2:
        return image

    quality = rng.randint(50, 95)
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        return image
    decoded = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if decoded is None:
        return image
    return decoded


def apply_shadow(image: np.ndarray, rng: random.Random) -> np.ndarray:
    h, w = image.shape[:2]
    overlay = image.copy()
    mask = np.zeros((h, w), dtype=np.uint8)

    x1 = rng.randint(0, max(1, w // 3))
    x2 = rng.randint((2 * w) // 3, max((2 * w) // 3 + 1, w - 1))
    y1 = rng.randint(0, max(1, h - 1))
    y2 = min(h - 1, max(0, y1 + rng.randint(-h // 4, h // 4)))
    thickness = max(6, int(min(w, h) * rng.uniform(0.05, 0.1)))

    cv2.line(mask, (x1, y1), (x2, y2), 255, thickness)
    mask = cv2.GaussianBlur(mask, (31, 31), 0)
    darken = rng.uniform(0.55, 0.8)
    overlay[mask > 0] = (overlay[mask > 0].astype(np.float32) * darken).astype(np.uint8)
    alpha = (mask.astype(np.float32) / 255.0)[:, :, None]
    return (image.astype(np.float32) * (1 - alpha) + overlay.astype(np.float32) * alpha).astype(np.uint8)


def apply_glare(image: np.ndarray, rng: random.Random) -> np.ndarray:
    h, w = image.shape[:2]
    overlay = image.copy()
    center = (rng.randint(0, w - 1), rng.randint(0, h - 1))
    radius = max(6, int(min(w, h) * rng.uniform(0.04, 0.08)))
    cv2.circle(overlay, center, radius, (255, 255, 255), -1)
    overlay = cv2.GaussianBlur(overlay, (21, 21), 0)
    return cv2.addWeighted(image, 0.82, overlay, 0.18, 0)


def augment_image(image: np.ndarray, rng: random.Random) -> np.ndarray:
    augmented = image.copy()

    augmented = apply_affine(augmented, rng)
    if rng.random() < 0.05:
        augmented = apply_perspective(augmented, rng)
    if rng.random() < 0.4:
        augmented = apply_lighting(augmented, rng)
    augmented = apply_blur(augmented, rng)
    augmented = apply_noise(augmented, rng)
    augmented = apply_jpeg_compression(augmented, rng)

    if rng.random() < 0.1:
        effect = rng.choice([apply_shadow, apply_glare])
        augmented = effect(augmented, rng)

    return augmented


def augment_split(
    split: str,
    label: str,
    images: list[Path],
    augmentations: int,
    include_originals: bool,
    seed: int,
) -> list[OutputRecord]:
    records: list[OutputRecord] = []
    split_dir = OUTPUTS_DIR / split / label
    rng = random.Random(seed)

    for index, image_path in enumerate(images, start=1):
        print(f"[{split}] {index}/{len(images)} {image_path.name}")
        image = read_image(image_path)
        if image is None:
            print("  skipped: not a readable image")
            continue

        stem = image_path.stem
        ext = output_extension(image_path)

        if include_originals:
            original_out = split_dir / f"{stem}__original{image_path.suffix.lower()}"
            if copy_original(image_path, original_out):
                records.append(
                    OutputRecord(split, label, image_path.name, original_out.name, False)
                )
            else:
                print("  warning: could not copy original")

        for aug_index in range(1, augmentations + 1):
            augmented = augment_image(image, rng)
            out_path = split_dir / f"{stem}__aug_{aug_index:03d}{ext}"
            if write_image(out_path, augmented):
                records.append(
                    OutputRecord(split, label, image_path.name, out_path.name, True)
                )
            else:
                print(f"  warning: could not write {out_path.name}")

    return records


def write_metadata(records: list[OutputRecord]) -> None:
    OUTPUTS_DIR.mkdir(exist_ok=True)
    metadata_path = OUTPUTS_DIR / "metadata.csv"
    with metadata_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=["split", "label", "original_file", "output_file", "is_augmented"],
        )
        writer.writeheader()
        for record in records:
            writer.writerow(
                {
                    "split": record.split,
                    "label": record.label,
                    "original_file": record.original_file,
                    "output_file": record.output_file,
                    "is_augmented": int(record.is_augmented),
                }
            )


def main() -> None:
    args = parse_args()
    if args.augmentations < 0:
        raise SystemExit("--augmentations must be 0 or greater")
    if not 0 <= args.val_ratio < 1:
        raise SystemExit("--val-ratio must be between 0 and less than 1")

    ensure_directories(args.label)

    images, skipped = list_input_files()
    for path in skipped:
        print(f"skipped unsupported file: {path.name}")

    if not images:
        print(f"No supported images found in {INPUTS_DIR}/")
        return

    splits = split_originals(images, args.val_ratio, args.seed)
    include_originals = not args.no_originals

    all_records: list[OutputRecord] = []
    for split, split_images in splits.items():
        all_records.extend(
            augment_split(
                split=split,
                label=args.label,
                images=split_images,
                augmentations=args.augmentations,
                include_originals=include_originals,
                seed=args.seed + (0 if split == "train" else 10_000),
            )
        )

    write_metadata(all_records)

    print()
    print("Done.")
    print(f"Original images: {len(images)}")
    print(f"Train originals: {len(splits['train'])}")
    print(f"Validation originals: {len(splits['val'])}")
    print(f"Output files: {len(all_records)}")
    print(f"Metadata: {OUTPUTS_DIR / 'metadata.csv'}")


if __name__ == "__main__":
    main()
