CREATE OR REPLACE FUNCTION public.xaro_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER entities_set_updated_at
BEFORE UPDATE ON public.entities
FOR EACH ROW EXECUTE FUNCTION public.xaro_set_updated_at();
