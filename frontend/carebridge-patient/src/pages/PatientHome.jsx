import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import MainTabs from "../components/MainTabs";
import CarePlansTab from "../components/tabs/CarePlansTab";
import MedicationsTab from "../components/tabs/MedicationsTab";
import FollowUpTab from "../components/tabs/FollowUpTab";
import ChatTab from "../components/tabs/ChatTab";

const TAB_COMPONENTS = {
  careplans: CarePlansTab,
  medications: MedicationsTab,
  followup: FollowUpTab,
  chat: ChatTab,
};

export default function PatientHome() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("careplans");

  useEffect(() => {
    const stored = localStorage.getItem("carebridge_user");
    if (!stored) {
      navigate("/login");
      return;
    }
    try {
      setUser(JSON.parse(stored));
    } catch {
      navigate("/login");
    }
  }, [navigate]);

  if (!user) return null;

  const ActiveTab = TAB_COMPONENTS[activeTab] || CarePlansTab;

  return (
    <div className="min-h-screen" style={{ background: "#FDF6EC" }}>
      <NavBar user={user} />
      <MainTabs activeTab={activeTab} onTabChange={setActiveTab} />
      <div className={activeTab === "chat" ? "flex flex-col" : ""}>
        <ActiveTab />
      </div>
    </div>
  );
}
