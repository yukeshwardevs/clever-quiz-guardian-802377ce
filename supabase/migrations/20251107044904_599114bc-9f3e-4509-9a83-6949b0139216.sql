-- Drop existing restrictive profile policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in test results" ON public.profiles;

-- Create comprehensive policy for profile viewing
CREATE POLICY "Profile viewing policy"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id OR has_role(auth.uid(), 'admin')
);