import { Space_Grotesk, Work_Sans } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "ScholarSync | Academic Rigor Redefined",
  description: "Experience a modern approach to cross-disciplinary data extraction and peer-reviewed analysis. Synthesize scientific output with local vector indices and Google Gemini.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${workSans.variable} h-full antialiased light`}
    >
      <body className="min-h-full flex flex-col bg-surface text-on-surface">{children}</body>
    </html>
  );
}

