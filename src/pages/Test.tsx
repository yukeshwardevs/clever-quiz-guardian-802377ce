import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { AlertTriangle, Camera, Mic, Eye, EyeOff, Shield } from "lucide-react";
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

const MAX_WARNINGS = 5;

const Test = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState(1800);
  const [warnings, setWarnings] = useState(0);
  const [cameraPermission, setCameraPermission] = useState(false);
  const [micPermission, setMicPermission] = useState(false);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const warningsRef = useRef(0);
  const sessionIdRef = useRef("");
  const answersRef = useRef<Record<string, string>>({});
  const questionsRef = useRef<Question[]>([]);
  const submittedRef = useRef(false);

  const logProctoring = useCallback(async (eventType: string, eventData: any) => {
    if (sessionIdRef.current) {
      await supabase.from("proctoring_logs").insert({
        session_id: sessionIdRef.current,
        event_type: eventType,
        event_data: eventData,
      });
    }
  }, []);

  const forceSubmit = useCallback(async () => {
    if (submittedRef.current || !sessionIdRef.current) return;
    submittedRef.current = true;

    const currentAnswers = answersRef.current;
    const currentQuestions = questionsRef.current;

    // Calculate score from local answers
    let correctCount = 0;
    currentQuestions.forEach((q) => {
      if (currentAnswers[q.id] === q.correct_option) {
        correctCount++;
      }
    });
    const score = currentQuestions.length > 0 ? (correctCount / currentQuestions.length) * 100 : 0;

    await supabase
      .from("test_sessions")
      .update({
        status: "submitted",
        end_time: new Date().toISOString(),
        score,
        answered_questions: Object.keys(currentAnswers).length,
      })
      .eq("id", sessionIdRef.current);

    toast.error("Test auto-submitted due to too many tab switches!");
    navigate("/results");
  }, [navigate]);

  const handleSubmit = useCallback(async () => {
    if (!sessionIdRef.current || submittedRef.current) return;

    const currentAnswers = answersRef.current;
    const currentQuestions = questionsRef.current;

    // Check if all questions are answered
    const unanswered = currentQuestions.filter((q) => !currentAnswers[q.id]);
    if (unanswered.length > 0) {
      toast.error(`Please answer all questions. ${unanswered.length} question(s) remaining.`);
      const firstUnansweredIdx = currentQuestions.findIndex((q) => !currentAnswers[q.id]);
      setCurrentIndex(firstUnansweredIdx);
      return;
    }

    setIsSubmitting(true);
    submittedRef.current = true;

    // Calculate score from local answers
    let correctCount = 0;
    currentQuestions.forEach((q) => {
      if (currentAnswers[q.id] === q.correct_option) {
        correctCount++;
      }
    });
    const score = (correctCount / currentQuestions.length) * 100;

    await supabase
      .from("test_sessions")
      .update({
        status: "submitted",
        end_time: new Date().toISOString(),
        score,
        answered_questions: Object.keys(currentAnswers).length,
      })
      .eq("id", sessionIdRef.current);

    toast.success("Test submitted successfully!");
    navigate("/results");
  }, [navigate]);

  useEffect(() => {
    initializeTest();
    requestPermissions();
  }, []);

  // Proctoring: tab switch / visibility change detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !submittedRef.current) {
        warningsRef.current += 1;
        const newWarnings = warningsRef.current;
        setWarnings(newWarnings);
        logProctoring("tab_switch", { count: newWarnings });

        if (newWarnings >= MAX_WARNINGS) {
          toast.error("Too many tab switches! Test will be auto-submitted.");
          forceSubmit();
        } else {
          toast.warning(`Warning ${newWarnings}/${MAX_WARNINGS}: Tab switch detected! ${MAX_WARNINGS - newWarnings} remaining.`);
        }
      }
    };

    const handleBlur = () => {
      if (!submittedRef.current) {
        logProctoring("window_blur", { timestamp: new Date().toISOString() });
      }
    };

    const handleContextMenu = (e: Event) => e.preventDefault();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent copy/paste
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'x' || e.key === 'u')) {
        e.preventDefault();
        logProctoring("keyboard_shortcut_blocked", { key: e.key });
        toast.warning("Copy/Paste is disabled during the test.");
      }
      // Prevent print screen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        logProctoring("print_screen_blocked", {});
      }
    };

    const handleCopy = (e: Event) => {
      e.preventDefault();
      logProctoring("copy_blocked", {});
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("copy", handleCopy);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("copy", handleCopy);
    };
  }, [logProctoring, forceSubmit]);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          forceSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [forceSubmit]);

  // Fullscreen management
  useEffect(() => {
    const enterFullscreen = async () => {
      try {
        await document.documentElement.requestFullscreen();
        setFullscreenActive(true);
      } catch {
        logProctoring("fullscreen_denied", {});
      }
    };

    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setFullscreenActive(isFs);
      if (!isFs && !submittedRef.current) {
        logProctoring("fullscreen_exit", {});
        toast.warning("Please stay in fullscreen mode during the test.");
      }
    };

    enterFullscreen();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [logProctoring]);

  const initializeTest = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data: questionsData } = await supabase
      .from("mcq_questions")
      .select("*")
      .limit(30);

    if (questionsData) {
      setQuestions(questionsData);
      questionsRef.current = questionsData;

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
        sessionIdRef.current = session.id;
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
    } catch {
      toast.error("Please enable camera and microphone access");
      logProctoring("camera_disabled", { error: "Permission denied" });
    }
  };

  const handleAnswer = (value: string) => {
    const currentQuestion = questions[currentIndex];
    const newAnswers = { ...answers, [currentQuestion.id]: value };
    setAnswers(newAnswers);
    answersRef.current = newAnswers;

    // Save answer to DB
    if (sessionIdRef.current) {
      supabase.from("test_answers").upsert({
        session_id: sessionIdRef.current,
        question_id: currentQuestion.id,
        selected_option: value,
        is_correct: value === currentQuestion.correct_option,
        answered_at: new Date().toISOString(),
      });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Shield className="h-12 w-12 text-primary animate-pulse mx-auto" />
          <p className="text-lg text-muted-foreground">Loading test & initializing proctoring...</p>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4 select-none">
      <div className="container mx-auto max-w-4xl py-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Python MCQ Test</h1>
            <p className="text-muted-foreground">
              Question {currentIndex + 1} of {questions.length} • {answeredCount} answered
            </p>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${timeLeft < 300 ? "text-destructive animate-pulse" : "text-primary"}`}>
              {formatTime(timeLeft)}
            </div>
            <div className="text-sm text-muted-foreground">Time Remaining</div>
          </div>
        </div>

        {/* Proctoring Status Bar */}
        <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          <Alert variant={cameraPermission ? "default" : "destructive"} className="py-2">
            <Camera className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Camera: {cameraPermission ? "Active" : "Off"}
            </AlertDescription>
          </Alert>
          <Alert variant={micPermission ? "default" : "destructive"} className="py-2">
            <Mic className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Mic: {micPermission ? "Active" : "Off"}
            </AlertDescription>
          </Alert>
          <Alert variant={fullscreenActive ? "default" : "destructive"} className="py-2">
            {fullscreenActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            <AlertDescription className="text-xs">
              Fullscreen: {fullscreenActive ? "On" : "Off"}
            </AlertDescription>
          </Alert>
          <Alert variant={warnings > 0 ? "destructive" : "default"} className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Warnings: {warnings}/{MAX_WARNINGS}
            </AlertDescription>
          </Alert>
        </div>

        <Progress value={progress} className="mb-4" />

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
                <div key={option} className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-accent transition-colors">
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
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? "Submitting..." : "Submit Test"}
                </Button>
              ) : (
                <Button onClick={() => setCurrentIndex(currentIndex + 1)}>
                  Next
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Question Navigator */}
        <Card className="mt-4">
          <CardContent className="pt-4">
            <h3 className="font-semibold mb-3 text-sm">Question Navigator</h3>
            <div className="grid grid-cols-10 gap-2">
              {questions.map((q, idx) => (
                <Button
                  key={q.id}
                  variant={answers[q.id] ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentIndex(idx)}
                  className={`text-xs ${currentIndex === idx ? "ring-2 ring-primary" : ""}`}
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
