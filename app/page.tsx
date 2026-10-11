import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-16 text-foreground">
      <Card className="w-full max-w-xl border-border/80 shadow-sm">
        <CardHeader className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Project foundation
          </p>
          <CardTitle className="text-3xl tracking-tight">Grand Pa’s Cold Store</CardTitle>
          <CardDescription className="text-base">System Foundation Ready</CardDescription>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          The responsive web application foundation is in place. Business features will be
          added in their planned phases.
        </CardContent>
      </Card>
    </main>
  );
}
