# Card Detector (Python Version)

This project replicates the card detection logic from the Next.js frontend and adds high-quality perspective cropping.

## Setup

1. Make sure you have Python installed.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. Place the images you want to process into the `inputs/` folder.
2. Run the detector:
   ```bash
   python main.py
   ```
3. Check the `outputs/` folder for the cropped images.

## How it works

The detector uses the same pipeline as the web version:
1. **Grayscale & Blur**: Reduces noise.
2. **Canny Edge Detection**: Finds outlines.
3. **Contour Analysis**: Filters for quadrilaterals with specific area and aspect ratios.
4. **Scoring System**: Evaluates candidates based on color consistency, edge density, and geometry.
5. **Perspective Transform**: Crops and "flattens" the card into a clean rectangular image.
