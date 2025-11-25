import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookOpen, Download, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AIFeedback } from "@/components/AIFeedback";

interface TestSession {
  id: string;
  start_time: string;
  end_time: string;
  score: number;
  total_questions: number;
  answered_questions: number;
  profiles: { full_name: string; email: string };
}

const Results = () => {
  const [sessions, setSessions] = useState<TestSession[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
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

    // Check if admin
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    const admin = !!roles;
    setIsAdmin(admin);

    // Fetch sessions
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
      // Fetch profiles for all student IDs
      const studentIds = [...new Set(sessionsData.map(s => s.student_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", studentIds);
      
      // Map profiles to sessions
      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
      const sessionsWithProfiles = sessionsData.map(session => ({
        ...session,
        profiles: profilesMap.get(session.student_id) || null
      }));
      
      setSessions(sessionsWithProfiles as any);
    }
    setLoading(false);
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

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Test Results</h1>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
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
        {/* AI Feedback for latest result - Students only */}
        {!isAdmin && sessions.length > 0 && (
          <AIFeedback sessionId={sessions[0].id} score={sessions[0].score} />
        )}

        <Card>
          <CardHeader>
            <CardTitle>{isAdmin ? "All Test Results" : "My Test Results"}</CardTitle>
            <CardDescription>
              {isAdmin
                ? "View and download reports for all candidates"
                : "Your test history and performance"}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id}>
                      {isAdmin && (
                        <>
                          <TableCell className="font-medium">
                            {session.profiles?.full_name || "N/A"}
                          </TableCell>
                          <TableCell>{session.profiles?.email}</TableCell>
                        </>
                      )}
                      <TableCell>
                        {new Date(session.start_time).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-bold text-primary">
                        {session.score?.toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        {session.answered_questions}/{session.total_questions}
                      </TableCell>
                      <TableCell>{getScoreBadge(session.score)}</TableCell>
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
