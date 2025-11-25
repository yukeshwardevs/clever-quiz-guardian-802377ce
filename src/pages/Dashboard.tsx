import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { BookOpen, LogOut, PlayCircle, BarChart3 } from "lucide-react";
import { AIQuestionGenerator } from "@/components/AIQuestionGenerator";
import { User } from "@supabase/supabase-js";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate("/auth");
      return;
    }

    setUser(user);

    // Check if user is admin
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    setIsAdmin(!!roles);
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/");
  };

  const startTest = () => {
    navigate("/test");
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
            <h1 className="text-2xl font-bold">Python MCQ Evaluator</h1>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">
            Welcome, {user?.user_metadata?.full_name || user?.email}!
          </h2>
          <p className="text-muted-foreground">
            {isAdmin ? "Admin Dashboard" : "Student Dashboard"}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {!isAdmin && (
            <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={startTest}>
              <CardHeader>
                <PlayCircle className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Start New Test</CardTitle>
                <CardDescription>
                  Begin a new Python MCQ assessment
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full">Start Test</Button>
              </CardContent>
            </Card>
          )}

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate("/results")}>
            <CardHeader>
              <BarChart3 className="h-10 w-10 text-primary mb-2" />
              <CardTitle>{isAdmin ? "View All Results" : "My Results"}</CardTitle>
              <CardDescription>
                {isAdmin ? "View all student test results" : "View your test history and scores"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">View Results</Button>
            </CardContent>
          </Card>

          {isAdmin && (
            <>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate("/admin")}>
                <CardHeader>
                  <BookOpen className="h-10 w-10 text-primary mb-2" />
                  <CardTitle>Manage Questions</CardTitle>
                  <CardDescription>
                    Add, edit, or delete MCQ questions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">Manage</Button>
                </CardContent>
              </Card>
              
              <div className="md:col-span-2">
                <AIQuestionGenerator />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
