import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { AlertTriangle, Camera, Mic } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Question {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
}

const Test = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState(1800); // 30 minutes
  const [warnings, setWarnings] = useState(0);
  const [cameraPermission, setCameraPermission] = useState(false);
  const [micPermission, setMicPermission] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    initializeTest();
    requestPermissions();
    setupProctoring();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const initializeTest = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    // Fetch questions
    const { data: questionsData } = await supabase
      .from("mcq_questions")
      .select("*")
      .limit(10);

    if (questionsData) {
      setQuestions(questionsData);

      // Create test session
      const { data: session } = await supabase
        .from("test_sessions")
        .insert({
          student_id: user.id,
          total_questions: questionsData.length,
          duration_minutes: 30,
        })
        .select()
        .single();

      if (session) {
        setSessionId(session.id);
      }
    }
  };

  const requestPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setCameraPermission(true);
      setMicPermission(true);
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      toast.error("Please enable camera and microphone access");
      logProctoring("camera_disabled", { error: "Permission denied" });
    }
  };

  const setupProctoring = () => {
    // Window blur detection
    window.addEventListener("blur", () => {
      const newWarnings = warnings + 1;
      setWarnings(newWarnings);
      logProctoring("window_blur", { count: newWarnings });
      
      if (newWarnings >= 3) {
        toast.error("Too many warnings! Test will be auto-submitted.");
        setTimeout(handleSubmit, 2000);
      } else {
        toast.warning(`Warning ${newWarnings}/3: You navigated away from the test!`);
      }
    });

    // Prevent right-click
    document.addEventListener("contextmenu", (e) => e.preventDefault());
  };

  const logProctoring = async (eventType: string, eventData: any) => {
    if (sessionId) {
      await supabase.from("proctoring_logs").insert({
        session_id: sessionId,
        event_type: eventType,
        event_data: eventData,
      });
    }
  };

  const handleAnswer = (value: string) => {
    const currentQuestion = questions[currentIndex];
    setAnswers({ ...answers, [currentQuestion.id]: value });

    // Save answer
    if (sessionId) {
      supabase.from("test_answers").upsert({
        session_id: sessionId,
        question_id: currentQuestion.id,
        selected_option: value,
        is_correct: value === currentQuestion.correct_option,
        answered_at: new Date().toISOString(),
      });
    }
  };

  const handleSubmit = async () => {
    if (!sessionId) return;

    // Calculate score
    const { data: answersData } = await supabase
      .from("test_answers")
      .select("is_correct")
      .eq("session_id", sessionId);

    const correctAnswers = answersData?.filter((a) => a.is_correct).length || 0;
    const score = (correctAnswers / questions.length) * 100;

    // Update session
    await supabase
      .from("test_sessions")
      .update({
        status: "submitted",
        end_time: new Date().toISOString(),
        score: score,
        answered_questions: Object.keys(answers).length,
      })
      .eq("id", sessionId);

    toast.success("Test submitted successfully!");
    navigate("/results");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (questions.length === 0) {
    return <div className="min-h-screen flex items-center justify-center">Loading test...</div>;
  }

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="container mx-auto max-w-4xl py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Python MCQ Test</h1>
            <p className="text-muted-foreground">
              Question {currentIndex + 1} of {questions.length}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-primary">{formatTime(timeLeft)}</div>
            <div className="text-sm text-muted-foreground">Time Remaining</div>
          </div>
        </div>

        {/* Proctoring Status */}
        <div className="mb-6 flex gap-4">
          <Alert variant={cameraPermission ? "default" : "destructive"}>
            <Camera className="h-4 w-4" />
            <AlertDescription>
              Camera: {cameraPermission ? "Active" : "Disabled"}
            </AlertDescription>
          </Alert>
          <Alert variant={micPermission ? "default" : "destructive"}>
            <Mic className="h-4 w-4" />
            <AlertDescription>
              Microphone: {micPermission ? "Active" : "Disabled"}
            </AlertDescription>
          </Alert>
          {warnings > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Warnings: {warnings}/3</AlertDescription>
            </Alert>
          )}
        </div>

        <Progress value={progress} className="mb-6" />

        {/* Question Card */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-6">{currentQuestion.question_text}</h2>

            <RadioGroup
              value={answers[currentQuestion.id] || ""}
              onValueChange={handleAnswer}
              className="space-y-4"
            >
              {["A", "B", "C", "D"].map((option) => (
                <div key={option} className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-accent">
                  <RadioGroupItem value={option} id={`option-${option}`} />
                  <Label htmlFor={`option-${option}`} className="flex-1 cursor-pointer">
                    <strong>{option}.</strong> {currentQuestion[`option_${option.toLowerCase()}` as keyof Question]}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {/* Navigation */}
            <div className="flex justify-between mt-8">
              <Button
                variant="outline"
                onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                disabled={currentIndex === 0}
              >
                Previous
              </Button>

              {currentIndex === questions.length - 1 ? (
                <Button onClick={handleSubmit}>Submit Test</Button>
              ) : (
                <Button onClick={() => setCurrentIndex(currentIndex + 1)}>
                  Next
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Question Navigator */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-4">Question Navigator</h3>
            <div className="grid grid-cols-10 gap-2">
              {questions.map((q, idx) => (
                <Button
                  key={q.id}
                  variant={answers[q.id] ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentIndex(idx)}
                  className={currentIndex === idx ? "ring-2 ring-accent" : ""}
                >
                  {idx + 1}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Test;
