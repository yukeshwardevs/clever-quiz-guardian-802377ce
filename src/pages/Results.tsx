import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookOpen, Download, ArrowLeft, CheckCircle, XCircle, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AIFeedback } from "@/components/AIFeedback";
import { Progress } from "@/components/ui/progress";

interface TestSession {
  id: string;
  start_time: string;
  end_time: string;
  score: number;
  total_questions: number;
  answered_questions: number;
  student_id: string;
  profiles: { full_name: string; email: string } | null;
}

interface AnswerDetail {
  id: string;
  question_id: string;
  selected_option: string | null;
  is_correct: boolean | null;
  mcq_questions: {
    question_text: string;
    correct_option: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    difficulty: string;
  } | null;
}

const Results = () => {
  const [sessions, setSessions] = useState<TestSession[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [answerDetails, setAnswerDetails] = useState<AnswerDetail[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    const admin = !!roles;
    setIsAdmin(admin);

    let query = supabase
      .from("test_sessions")
      .select("*")
      .eq("status", "submitted")
      .order("created_at", { ascending: false });

    if (!admin) {
      query = query.eq("student_id", user.id);
    }

    const { data: sessionsData } = await query;

    if (sessionsData && sessionsData.length > 0) {
      const studentIds = [...new Set(sessionsData.map(s => s.student_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", studentIds);

      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
      const sessionsWithProfiles = sessionsData.map(session => ({
        ...session,
        profiles: profilesMap.get(session.student_id) || null,
      }));

      setSessions(sessionsWithProfiles as any);

      // Auto-load details for latest session (students)
      if (!admin && sessionsData.length > 0) {
        loadAnswerDetails(sessionsData[0].id);
      }
    }
    setLoading(false);
  };

  const loadAnswerDetails = async (sessionId: string) => {
    setSelectedSession(sessionId);
    const { data } = await supabase
      .from("test_answers")
      .select(`*, mcq_questions (question_text, correct_option, option_a, option_b, option_c, option_d, difficulty)`)
      .eq("session_id", sessionId);

    if (data) {
      setAnswerDetails(data as any);
    }
  };

  const downloadReport = () => {
    const csv = [
      ["Student", "Email", "Date", "Score", "Questions Answered", "Total Questions"],
      ...sessions.map((s) => [
        s.profiles?.full_name || "N/A",
        s.profiles?.email || "N/A",
        new Date(s.start_time).toLocaleString(),
        `${s.score?.toFixed(1)}%`,
        s.answered_questions,
        s.total_questions,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `test-results-${new Date().toISOString()}.csv`;
    a.click();
  };

  const getScoreBadge = (score: number) => {
    if (score >= 80) return <Badge className="bg-success text-success-foreground">Excellent</Badge>;
    if (score >= 60) return <Badge className="bg-info text-info-foreground">Good</Badge>;
    if (score >= 40) return <Badge className="bg-warning text-warning-foreground">Average</Badge>;
    return <Badge variant="destructive">Needs Improvement</Badge>;
  };

  const getOptionText = (answer: AnswerDetail, option: string) => {
    if (!answer.mcq_questions) return option;
    const key = `option_${option.toLowerCase()}` as keyof typeof answer.mcq_questions;
    return answer.mcq_questions[key] || option;
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return "bg-success/20 text-success-foreground border-success/30";
      case "medium": return "bg-warning/20 text-warning-foreground border-warning/30";
      case "hard": return "bg-destructive/20 text-destructive border-destructive/30";
      default: return "";
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const correctCount = answerDetails.filter(a => a.is_correct).length;
  const incorrectCount = answerDetails.filter(a => !a.is_correct && a.selected_option).length;
  const unansweredCount = answerDetails.filter(a => !a.selected_option).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Test Results</h1>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Dashboard
            </Button>
            {isAdmin && sessions.length > 0 && (
              <Button onClick={downloadReport}>
                <Download className="h-4 w-4 mr-2" />
                Download Report
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Score Overview for selected session */}
        {selectedSession && answerDetails.length > 0 && (
          <>
            {/* Score Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-4xl font-bold text-primary">
                    {sessions.find(s => s.id === selectedSession)?.score?.toFixed(1)}%
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Overall Score</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-4xl font-bold text-success">{correctCount}</div>
                  <p className="text-sm text-muted-foreground mt-1">Correct</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-4xl font-bold text-destructive">{incorrectCount}</div>
                  <p className="text-sm text-muted-foreground mt-1">Incorrect</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-4xl font-bold text-muted-foreground">{unansweredCount}</div>
                  <p className="text-sm text-muted-foreground mt-1">Unanswered</p>
                </CardContent>
              </Card>
            </div>

            {/* Accuracy Bar */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Accuracy</span>
                  <span className="text-sm text-muted-foreground">{correctCount}/{answerDetails.length} correct</span>
                </div>
                <Progress value={answerDetails.length > 0 ? (correctCount / answerDetails.length) * 100 : 0} />
              </CardContent>
            </Card>
          </>
        )}

        {/* AI Feedback */}
        {!isAdmin && sessions.length > 0 && (
          <AIFeedback sessionId={sessions[0].id} score={sessions[0].score} />
        )}

        {/* Detailed Answer Analysis */}
        {selectedSession && answerDetails.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <CardTitle>Question-by-Question Analysis</CardTitle>
              </div>
              <CardDescription>Review each question with correct answers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {answerDetails.map((answer, idx) => (
                <div
                  key={answer.id}
                  className={`p-4 rounded-lg border ${
                    answer.is_correct ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-sm">Q{idx + 1}.</span>
                        {answer.is_correct ? (
                          <CheckCircle className="h-4 w-4 text-success" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        {answer.mcq_questions?.difficulty && (
                          <Badge variant="outline" className={`text-xs ${getDifficultyColor(answer.mcq_questions.difficulty)}`}>
                            {answer.mcq_questions.difficulty}
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium mb-3">{answer.mcq_questions?.question_text}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        {["A", "B", "C", "D"].map((opt) => {
                          const isCorrect = answer.mcq_questions?.correct_option === opt;
                          const isSelected = answer.selected_option === opt;
                          return (
                            <div
                              key={opt}
                              className={`p-2 rounded border ${
                                isCorrect
                                  ? "bg-success/20 border-success/50 font-medium"
                                  : isSelected && !isCorrect
                                  ? "bg-destructive/20 border-destructive/50 line-through"
                                  : "border-border"
                              }`}
                            >
                              <strong>{opt}.</strong> {getOptionText(answer, opt)}
                              {isCorrect && <span className="ml-1 text-success">✓</span>}
                              {isSelected && !isCorrect && <span className="ml-1 text-destructive">✗</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Sessions Table */}
        <Card>
          <CardHeader>
            <CardTitle>{isAdmin ? "All Test Results" : "My Test Results"}</CardTitle>
            <CardDescription>
              {isAdmin ? "View and download reports for all candidates" : "Click a session to view detailed analysis"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No test results found</p>
                <Button onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && (
                      <>
                        <TableHead>Student</TableHead>
                        <TableHead>Email</TableHead>
                      </>
                    )}
                    <TableHead>Date</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Questions</TableHead>
                    <TableHead>Performance</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow
                      key={session.id}
                      className={`cursor-pointer ${selectedSession === session.id ? "bg-accent" : ""}`}
                      onClick={() => loadAnswerDetails(session.id)}
                    >
                      {isAdmin && (
                        <>
                          <TableCell className="font-medium">
                            {session.profiles?.full_name || "N/A"}
                          </TableCell>
                          <TableCell>{session.profiles?.email}</TableCell>
                        </>
                      )}
                      <TableCell>{new Date(session.start_time).toLocaleDateString()}</TableCell>
                      <TableCell className="font-bold text-primary">
                        {session.score?.toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        {session.answered_questions}/{session.total_questions}
                      </TableCell>
                      <TableCell>{getScoreBadge(session.score)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => loadAnswerDetails(session.id)}>
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Results;
