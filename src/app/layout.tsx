import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/dm-sans";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "interval — Protein tea that fits your day.", template: "%s · interval" },
  description: "Tea that keeps up. A calm planner for protein tea around your workouts and busy days. A hypothetical product for an academic project.",
  applicationName: "interval",
};

export const viewport: Viewport = { themeColor: "#FBF3E6", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="top-center" toastOptions={{ classNames: { toast: "!rounded-[var(--radius-md)] !border !border-line !bg-surface !text-espresso !font-sans" } }} />
      </body>
    </html>
  );
}
