# External Resource Audit

This document lists all external resources loaded by the application at runtime or startup.

## AI Model Files

| Resource | Full URL | File Type | Usage |
| :--- | :--- | :--- | :--- |
| **MobileNetV1** | Loaded via `@tensorflow-models/body-pix` (internal Google Storage URLs) | JSON/Binary | Pre-trained model for body segmentation (BodyPix). |

## 3D Models (GLTF/GLB)

| Resource | Path | File Type | Usage |
| :--- | :--- | :--- | :--- |
| **Shape 1** | `/assets/1.glb` | GLB | 3D model used for mosaic tiles (Variant 1). |
| **Shape 2** | `/assets/2.glb` | GLB | 3D model used for mosaic tiles (Variant 2). |
| **Shape 3** | `/assets/3.glb` | GLB | 3D model used for mosaic tiles (Variant 3). |

## Images

| Resource | Path | File Type | Usage |
| :--- | :--- | :--- | :--- |
| **Orange Shape** | `/assets/orange.png` | PNG | Floating decorative element on the Welcome Page. |
| **Green Shape** | `/assets/green.png` | PNG | Floating decorative element on the Welcome Page. |
| **Pink Shape** | `/assets/pink.png` | PNG | Floating decorative element on the Welcome Page. |

## Fonts

| Resource | Full URL | File Type | Usage |
| :--- | :--- | :--- | :--- |
| **Sofia Sans Extra Condensed** | `https://fonts.googleapis.com/css2?family=Sofia+Sans+Extra+Condensed:wght@400;600;800&display=swap` | CSS/WOFF2 | Primary display font for headlines and buttons. |

## JavaScript Libraries (NPM Packages)

These are bundled with the application but originate from external registries.

| Library | Version | Usage |
| :--- | :--- | :--- |
| **@google/genai** | ^1.29.0 | Google Gemini AI SDK. |
| **@react-three/drei** | ^10.7.7 | Helpers for React Three Fiber. |
| **@react-three/fiber** | ^9.5.0 | React renderer for Three.js. |
| **@tensorflow-models/body-pix**| ^2.2.1 | Body segmentation model. |
| **@tensorflow/tfjs** | ^4.22.0 | TensorFlow.js core library. |
| **lucide-react** | ^0.546.0 | Icon set. |
| **motion** | ^12.23.24 | Animation library. |
| **react** | ^19.0.0 | UI library. |
| **three** | ^0.183.1 | 3D graphics library. |
| **tailwindcss** | ^4.1.14 | CSS framework. |


