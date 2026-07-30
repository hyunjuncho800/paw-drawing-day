import type { Metadata } from "next";
import { Geist, Gaegu } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const gaegu = Gaegu({
  variable: "--font-gaegu",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "멍그리는 하루 | 반려견 AI 만화 일기",
  description: "우리 강아지와 함께한 오늘 하루를 AI 만화로 그려드려요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${gaegu.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
