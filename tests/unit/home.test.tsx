import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("foundation homepage", () => {
  it("renders the project name and foundation state", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: "Grand Pa’s Cold Store" }),
    ).toBeInTheDocument();
    expect(screen.getByText("System Foundation Ready")).toBeInTheDocument();
  });
});
