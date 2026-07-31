import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { DealPilotDashboard } from "./DealPilotDashboard";

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();
  return (
    <>
      <MobileHeader>
        <div className="flex items-center gap-2 text-secondary-foreground no-underline py-3">
          <img
            className="[.light_&]:hidden h-6"
            src={darkModeLogo}
            alt={title}
          />
          <img
            className="[.dark_&]:hidden h-6"
            src={lightModeLogo}
            alt={title}
          />
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
      </MobileHeader>
      <MobileContent>{children}</MobileContent>
    </>
  );
};

export const MobileDashboard = () => (
  <Wrapper>
    <DealPilotDashboard />
  </Wrapper>
);
