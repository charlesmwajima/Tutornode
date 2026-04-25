# TutorNode: Universal AI Academy

TutorNode is an advanced neural educational platform that leverages the power of Gemini 1.5 Flash to provide immersive, synchronized, multi-modal learning experiences. Designed for mastery-level education, it transforms any topic into a structured masterclass with synchronized visual slides, technical diagrams, and high-fidelity neural voice synthesis.

## 🚀 Key Features

- **Neural Link Mastery**: Conducts exhaustive, 8-12 segment masterclasses on any topic.
- **Synchronized Visuals**: Real-time slide generation with Markdown support, technical tables, and ASCII flowcharts.
- **Bi-Lingual Support**: Seamlessly switch between English and Swahili for all educational content.
- **AI-Driven Visuals**: Automatic generation of technical diagram prompts and scene descriptions.
- **Interactive Neural Stream**: Bottom-aligned synchronized subtitles for enhanced accessibility.
- **Adaptive Smartboard**: A futuristic educational interface designed for deep focus and technical clarity.
- **Neural History**: Local persistence of previous lessons for quick reference.

## 🛠️ Technology Stack

- **Frontend**: React 18 with Vite
- **AI Engine**: Google Gemini 1.5 Flash (via `@google/genai`)
- **Animations**: `motion/react` (Framer Motion)
- **Styling**: Tailwind CSS 4.0
- **Voice Synthesis**: Web Speech API with adaptive language matching
- **Icons**: Lucide React
- **Markdown Rendering**: `react-markdown`

## 📦 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone [repository-url]
   cd tutornode
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   Ensure your `GEMINI_API_KEY` is set in your environment variables.

4. **Start the development server**:
   ```bash
   npm run dev
   ```

## 🧠 Educational Workflow

TutorNode uses a "Neural Link" paradigm:
1. **Input**: User provides a topic (e.g., "Quantum Mechanics" or "Marine Diesel Engines").
2. **Analysis**: The system queries Gemini with a specialized "Masterclass Prompt" that enforces a segmented structure.
3. **Execution**: The platform starts a synchronized playback where each spoken segment is perfectly timed with its corresponding whiteboard slide.
4. **Reinforcement**: Students can follow along with high-contrast visuals and real-time subtitles.

---
*Built for the next generation of engineers and scholars.*
