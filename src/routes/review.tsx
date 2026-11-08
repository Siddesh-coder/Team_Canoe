import { Outlet, createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/review")({ component: () => <Outlet /> });
