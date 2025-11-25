import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AIFeedbackProps {
  sessionId: string;
  score: number;
}

export const AIFeedback = ({ sessionId, score }: AIFeedbackProps) => {
  const [feedback, setFeedback] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-results", {
        body: { sessionId },
      });

      if (error) throw error;

      setFeedback(data.feedback);
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Failed to generate feedback");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>AI Performance Analysis</CardTitle>
        </div>
        <CardDescription>
          Get personalized feedback and study recommendations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!feedback && (
          <Button onClick={handleAnalyze} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Get AI Feedback
              </>
            )}
          </Button>
        )}

        {feedback && (
          <Alert className="bg-card border-primary/20">
            <AlertDescription className="whitespace-pre-wrap text-sm leading-relaxed">
              {feedback}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
