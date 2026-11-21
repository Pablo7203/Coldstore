import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grand Pa’s Cold Store",
  description:
    "Browse the Grand Pa’s Cold Store selection and find good food, kept cold.",
  applicationName: "Grand Pa’s Cold Store",
  appleWebApp: {
    capable: true,
    title: "Grand Pa’s Cold Store",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f4ec",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
