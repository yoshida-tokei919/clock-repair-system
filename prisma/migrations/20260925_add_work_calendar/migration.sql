-- Server-only calendar exceptions. Ordinary 480-minute days have no row.
CREATE TABLE public."WorkCalendar" (
    "workDate" DATE NOT NULL,
    "availableMinutes" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkCalendar_pkey" PRIMARY KEY ("workDate"),
    CONSTRAINT "WorkCalendar_availableMinutes_check" CHECK ("availableMinutes" BETWEEN 0 AND 1440)
);

ALTER TABLE public."WorkCalendar" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."WorkCalendar" FROM anon, authenticated, service_role;
