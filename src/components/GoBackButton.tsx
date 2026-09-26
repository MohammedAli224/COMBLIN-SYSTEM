import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GoBackButtonProps {
  className?: string;
}

/** Returns the participant to the home page from a standalone form view. */
export function GoBackButton({ className }: GoBackButtonProps) {
  const { t } = useTranslation();
  return (
    <Button asChild variant="ghost" size="sm" className={cn("-ms-2 gap-1.5 text-muted-foreground", className)}>
      <Link to="/">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("common.back")}
      </Link>
    </Button>
  );
}
