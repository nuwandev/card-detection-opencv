# NIC Augmentation Generator

Generates realistic phone-camera style augmentations for already-cropped NIC or NOT_NIC image datasets.

This is tuned for a pipeline where OpenCV has already detected the card, perspective-warped it, and resized it before model training. Because of that, geometric changes are intentionally tiny; most augmentation comes from lighting and camera quality.

## Setup

```bash
cd nic-augmentation-generator
pip install -r requirements.txt
```

## Usage

1. Put your original images in `inputs/`.
2. Run:

```bash
python augment.py --label nic --augmentations 30
```

For negative samples:

```bash
python augment.py --label not_nic --augmentations 2
```

Outputs are written to:

```text
outputs/
  train/
    nic/
    not_nic/
  val/
    nic/
    not_nic/
  metadata.csv
```

The script splits original files first, then generates augmentations inside each split. This avoids the common mistake where augmented versions of the same original appear in both train and validation.

## Useful Options

```bash
python augment.py --label nic --augmentations 30 --val-ratio 0.2 --seed 42
```

By default, originals are copied to the output folders and augmentations are added beside them.

## Notes

- Non-image files in `inputs/` are skipped.
- Corrupt or unreadable images are skipped.
- The transformations are intentionally conservative: rotation is only about +/-3 degrees, scale is about 97%-103%, perspective is mild and rare, and no heavy occlusion is applied.
- Most variation comes from brightness, contrast, gamma, JPEG compression, noise, small blur, shadow, and glare.
- Do not mix NIC and NOT_NIC images in the same input run. Run the script separately for each label.
