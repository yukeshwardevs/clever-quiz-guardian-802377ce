-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'student');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view roles"
  ON public.user_roles FOR SELECT
  USING (true);

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create MCQ questions table
CREATE TABLE public.mcq_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.mcq_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view questions"
  ON public.mcq_questions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage questions"
  ON public.mcq_questions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create test sessions table
CREATE TABLE public.test_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'submitted')),
  total_questions INTEGER NOT NULL DEFAULT 0,
  answered_questions INTEGER NOT NULL DEFAULT 0,
  score DECIMAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.test_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own sessions"
  ON public.test_sessions FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students can insert own sessions"
  ON public.test_sessions FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can update own sessions"
  ON public.test_sessions FOR UPDATE
  USING (auth.uid() = student_id);

CREATE POLICY "Admins can view all sessions"
  ON public.test_sessions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create test answers table
CREATE TABLE public.test_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.test_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.mcq_questions(id) ON DELETE CASCADE,
  selected_option TEXT CHECK (selected_option IN ('A', 'B', 'C', 'D')),
  is_correct BOOLEAN,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, question_id)
);

ALTER TABLE public.test_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can manage own answers"
  ON public.test_answers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.test_sessions
      WHERE id = test_answers.session_id AND student_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all answers"
  ON public.test_answers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create proctoring logs table
CREATE TABLE public.proctoring_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.test_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('window_blur', 'tab_switch', 'camera_disabled', 'mic_disabled', 'fullscreen_exit')),
  event_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.proctoring_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can insert own logs"
  ON public.proctoring_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.test_sessions
      WHERE id = proctoring_logs.session_id AND student_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all logs"
  ON public.proctoring_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  
  -- Assign student role by default
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student');
  
  RETURN NEW;
END;
$$;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert sample Python MCQ questions
INSERT INTO public.mcq_questions (question_text, option_a, option_b, option_c, option_d, correct_option, difficulty) VALUES
('What is the output of: print(type([]))?', '<class ''tuple''>', '<class ''list''>', '<class ''dict''>', '<class ''set''>', 'B', 'easy'),
('Which keyword is used to define a function in Python?', 'function', 'def', 'func', 'define', 'B', 'easy'),
('What does len() function return?', 'Type of object', 'Length of object', 'Size in bytes', 'Memory address', 'B', 'easy'),
('Which of these is mutable in Python?', 'Tuple', 'String', 'List', 'Integer', 'C', 'medium'),
('What is the output of: print(3**2)?', '6', '9', '5', 'Error', 'B', 'medium'),
('Which method is used to add an element to a list?', 'add()', 'append()', 'insert()', 'push()', 'B', 'medium'),
('What does the ''self'' keyword represent in Python classes?', 'Class name', 'Instance of class', 'Parent class', 'Module', 'B', 'medium'),
('Which operator is used for floor division?', '/', '//', '%', '**', 'B', 'easy'),
('What is the correct way to import a module?', 'include module', 'import module', 'require module', 'use module', 'B', 'easy'),
('What is a decorator in Python?', 'A function that modifies another function', 'A class attribute', 'A type of loop', 'An error handler', 'A', 'hard');