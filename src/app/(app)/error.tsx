"use client";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

export default function ErrorState({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-4 pt-8">
      <h1 className="text-3xl">That didn&rsquo;t load.</h1>
      <Callout tone="error" title="Something went wrong on our side">
        Your data is safe and nothing was changed. Try again, or return to Today.
      </Callout>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <a href="/today">Go to Today</a>
        </Button>
      </div>
    </div>
  );
}
