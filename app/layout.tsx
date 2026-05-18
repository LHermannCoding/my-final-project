import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Audio Obscura",
  description: "A true-random music discovery engine with late-night bedroom energy."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
