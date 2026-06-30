import React, { useState, useEffect } from "react";
import { User, InventoryItem, TimelineItem } from "./types";
import {
  initialInventory,
  initialTimeline,
  skuCountOptions,
  SkuCountOption,
} from "./data";
import LoginScreen from "./components/LoginScreen";
import DashboardScreen from "./components/DashboardScreen";
import ReceiveScreen from "./components/ReceiveScreen";
import TimelineScreen from "./components/TimelineScreen";
import ProfileScreen from "./components/ProfileScreen";
import {
  Bell,
  LayoutDashboard,
  History,
  PlusSquare,
  UserCircle,
  CheckCircle,
  Flame,
  LogOut,
} from "lucide-react";

export default function App() {
  // --- Persistent State Hooks ---
  const [user, setUser] = useState<User | null>(() => {
    const cached = localStorage.getItem("buhler_session");
    return cached ? JSON.parse(cached) : null;
  });

  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    const cached = localStorage.getItem("buhler_inventory");
    return cached ? JSON.parse(cached) : initialInventory;
  });

  const [timeline, setTimeline] = useState<TimelineItem[]>(() => {
    const cached = localStorage.getItem("buhler_timeline");
    return cached ? JSON.parse(cached) : initialTimeline;
  });

  const [activeTab, setActiveTab] = useState<
    "overview" | "timeline" | "receive" | "profile"
  >("overview");
  const [selectedSkuToReceive, setSelectedSkuToReceive] = useState<
    string | undefined
  >(undefined);

  // Custom user-created SKU options
  const [customSkus, setCustomSkus] = useState<SkuCountOption[]>(() => {
    const cached = localStorage.getItem("buhler_custom_skus");
    return cached ? JSON.parse(cached) : [];
  });

  // Custom temporary popup notifier state
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null);

  // Merge default stock definitions and custom ones
  const mergedSkuOptions = React.useMemo(() => {
    return [...skuCountOptions, ...customSkus];
  }, [customSkus]);

  // Sync state to LocalStorage
  useEffect(() => {
    localStorage.setItem("buhler_custom_skus", JSON.stringify(customSkus));
  }, [customSkus]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("buhler_session", JSON.stringify(user));
    } else {
      localStorage.removeItem("buhler_session");
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem("buhler_inventory", JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem("buhler_timeline", JSON.stringify(timeline));
  }, [timeline]);

  // Callback to handle registering a brand new SKU
  const handleCreateCustomSku = (newOpt: SkuCountOption) => {
    setCustomSkus((prev) => {
      // Avoid duplicate SKU keys
      if (
        prev.some(
          (x) =>
            x.sku.toUpperCase() === newOpt.sku.toUpperCase() ||
            x.sku.toUpperCase() === "SKU-" + newOpt.sku.toUpperCase(),
        )
      ) {
        return prev;
      }
      return [...prev, newOpt];
    });

    setInventory((prev) => {
      const formattedSku = newOpt.sku;
      if (
        prev.some((x) => x.sku.toUpperCase() === formattedSku.toUpperCase())
      ) {
        return prev;
      }
      const newInventoryEntry: InventoryItem = {
        sku: formattedSku,
        name: newOpt.name,
        section: newOpt.section,
        quantity: 0, // initially zero stock
        unit: "Units",
        updatedTime: "Registered just now",
        isLowStock: true,
        isCritical: true,
      };
      return [newInventoryEntry, ...prev];
    });

    triggerNotification(`Custom SKU registered successfully: ${newOpt.name}`);
  };

  // Handle successful login
  const handleLogin = (newUser: User) => {
    setUser(newUser);
    setActiveTab("overview");
    triggerNotification(`Authorized terminal session started: ${newUser.name}`);
  };

  // Trigger brief alert notifications
  const triggerNotification = (msg: string) => {
    setNotifyMessage(msg);
    setTimeout(() => {
      setNotifyMessage(null);
    }, 4500);
  };

  // Handle SKU receipt confirmation from camera view
  const handleConfirmReceipt = (
    sku: string,
    verifiedCount: number,
    serial: string,
  ) => {
    // 1. Update SKU quantity in core inventory lists
    setInventory((prev) => {
      return prev.map((item) => {
        if (item.sku === sku) {
          const freshQuantity = item.quantity + verifiedCount;
          // Dynamically clear low stock flags if above threshold
          return {
            ...item,
            quantity: freshQuantity,
            isLowStock: freshQuantity < 50,
            isCritical: freshQuantity < 20,
            updatedTime: "Updated just now",
          };
        }
        return item;
      });
    });

    // 2. Locate Sku Metadata to obtain exact display name
    const matchingItem = inventory.find((i) => i.sku === sku);
    const itemName = matchingItem ? matchingItem.name : "Hardware Component";

    // 3. Construct chronological Timeline movement item
    const rightNow = new Date();
    // format to e.g. "09:41 AM"
    const timestampStr = rightNow.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const dateOpts: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
    };
    const dateTodayStr = `Today, ${rightNow.toLocaleDateString("en-US", dateOpts)}`;

    const freshEvent: TimelineItem = {
      id: `tx-user-${Date.now()}`,
      itemName,
      sku,
      quantityChange: verifiedCount,
      timestamp: timestampStr,
      dateGroup: dateTodayStr,
      type: "RECEIVED",
      operator: user ? user.name : "M. Operator",
      reference: serial
        ? `Serial: ${serial}`
        : `Inspected: ${user?.name || "Operator"}`,
    };

    setTimeline((prev) => [freshEvent, ...prev]);

    // 4. Redirect user to overview so they see their stock adjusted!
    setActiveTab("overview");
    triggerNotification(
      `SUCCESS: Received +${verifiedCount} ${itemName} items!`,
    );
  };

  // Reset local database state back to standard mock arrays
  const handleResetDatabase = () => {
    setInventory(initialInventory);
    setTimeline(initialTimeline);
    localStorage.setItem("buhler_inventory", JSON.stringify(initialInventory));
    localStorage.setItem("buhler_timeline", JSON.stringify(initialTimeline));
    triggerNotification(
      "Plant database successfully reset to factory parameters.",
    );
  };

  // Log user out
  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("buhler_session");
    setActiveTab("overview");
  };

  // Sku receiving redirect shortcut helper
  const navigateToReceiveWithSku = (sku?: string) => {
    setSelectedSkuToReceive(sku);
    setActiveTab("receive");
  };

  // If user is not authenticated, load the styled Login form
  if (!user) {
    return <LoginScreen onLoginSuccess={handleLogin} />;
  }

  // Count active shift inputs
  const shiftInspectionsCount = timeline.filter((t) =>
    t.id.startsWith("tx-user-"),
  ).length;

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center items-stretch antialiased font-sans">
      {/* Premium Frameless Screen Container for Handheld/Desktop Viewports */}
      <div className="w-full max-w-md bg-[#f7f9fb] flex flex-col items-stretch relative shadow-2xl border-x border-[#bdc9c7]">
        {/* Banner Success Alert Notification overlay */}
        {notifyMessage && (
          <div className="absolute top-16 inset-x-4 z-50 animate-bounce">
            <div className="bg-emerald-600 text-white p-3.5 rounded-xl shadow-lg flex items-center gap-2.5 text-xs font-bold border border-emerald-500">
              <CheckCircle size={16} className="shrink-0 text-emerald-100" />
              <span>{notifyMessage}</span>
            </div>
          </div>
        )}

        {/* Top Navigation Banner Header */}
        <header className="fixed top-0 max-w-md w-full shrink-0 z-40 bg-white border-b border-[#bdc9c7]/30 flex justify-between items-center h-14 px-4 shadow-sm">
          {/* Logo Icon brand trigger */}
          <button
            onClick={() => setActiveTab("overview")}
            className="p-1.5 rounded-full hover:bg-slate-100 text-brand-teal transition-all active:scale-95"
            title="Overview dashboard"
          >
            {/* Box Icon design */}
            <div className="w-6 h-6 border-2 border-brand-teal rounded-md flex flex-col justify-between p-0.5">
              <div className="w-full h-0.5 bg-brand-teal"></div>
              <div className="w-2 h-0.5 bg-brand-teal mx-auto rounded-sm"></div>
            </div>
          </button>

          {/* Buhler Brand identity */}
          <div className="flex flex-col items-center select-none">
            {/* <h1 className="text-xl font-black text-brand-teal tracking-tight leading-none">
              Bühler
            </h1> */}
            <span className="text-[8px] font-bold tracking-widest text-[#505f76] uppercase mt-0.5">
              Plant 4 Terminal
            </span>
          </div>

          {/* Trigger Alert bells or statistics */}
          <button
            onClick={() =>
              triggerNotification(
                "Current Plant communication channels are operate nominally.",
              )
            }
            className="p-2 text-gray-500 hover:text-brand-teal transition-colors rounded-full hover:bg-slate-50"
            title="System Status alert"
          >
            <div className="relative">
              <Bell size={18} />
              <div className="absolute top-0 right-0 w-2 h-2 bg-brand-teal rounded-full animate-ping"></div>
            </div>
          </button>
        </header>

        {/* Core Main Viewport Canvas (Enforces 14px grid dense text padding) */}
        <main className="flex-grow pt-20 px-4 pb-24 overflow-y-auto w-full">
          {activeTab === "overview" && (
            <DashboardScreen
              inventory={inventory}
              onNavigateToReceive={navigateToReceiveWithSku}
              skuOptions={mergedSkuOptions}
              onCreateCustomSku={handleCreateCustomSku}
            />
          )}

          {activeTab === "receive" && (
            <ReceiveScreen
              preSelectedSku={selectedSkuToReceive}
              onConfirmReceipt={handleConfirmReceipt}
              skuOptions={mergedSkuOptions}
            />
          )}

          {activeTab === "timeline" && <TimelineScreen timeline={timeline} />}

          {activeTab === "profile" && (
            <ProfileScreen
              user={user}
              onResetDatabase={handleResetDatabase}
              onLogout={handleLogout}
              inspectionsCount={shiftInspectionsCount}
            />
          )}
        </main>

        {/* Handheld Device Bottom Navigation Footer (H: 16) */}
        <nav className="fixed bottom-0 max-w-md w-full z-40 bg-white border-t border-[#bdc9c7]/30 flex justify-around items-stretch h-16">
          {/* Overview button */}
          <button
            onClick={() => {
              setSelectedSkuToReceive(undefined);
              setActiveTab("overview");
            }}
            className={`flex flex-col items-center justify-center flex-1 h-full font-bold select-none transition-all ${
              activeTab === "overview"
                ? "text-brand-teal scale-100 bg-[#eceef0]/30 font-extrabold"
                : "text-gray-400 hover:text-brand-teal hover:bg-slate-50 scale-95"
            }`}
          >
            <LayoutDashboard size={20} className="mb-0.5" />
            <span className="text-[10px] tracking-tight">Overview</span>
          </button>

          {/* Timeline button */}
          <button
            onClick={() => setActiveTab("timeline")}
            className={`flex flex-col items-center justify-center flex-1 h-full font-bold select-none transition-all ${
              activeTab === "timeline"
                ? "text-brand-teal scale-100 bg-[#eceef0]/30 font-extrabold"
                : "text-gray-400 hover:text-brand-teal hover:bg-slate-50 scale-95"
            }`}
          >
            <History size={20} className="mb-0.5" />
            <span className="text-[10px] tracking-tight">Timeline</span>
          </button>

          {/* Scan Receive button */}
          <button
            onClick={() => navigateToReceiveWithSku()}
            className={`flex flex-col items-center justify-center flex-1 h-full font-bold select-none transition-all ${
              activeTab === "receive"
                ? "text-brand-teal scale-100 bg-[#eceef0]/30 font-extrabold"
                : "text-gray-400 hover:text-brand-teal hover:bg-slate-50 scale-95"
            }`}
          >
            <PlusSquare size={20} className="mb-0.5" />
            <span className="text-[10px] tracking-tight">Receive</span>
          </button>

          {/* Profile statistics */}
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex flex-col items-center justify-center flex-1 h-full font-bold select-none transition-all ${
              activeTab === "profile"
                ? "text-brand-teal scale-100 bg-[#eceef0]/30 font-extrabold"
                : "text-gray-400 hover:text-brand-teal hover:bg-slate-50 scale-95"
            }`}
          >
            <UserCircle size={20} className="mb-0.5" />
            <span className="text-[10px] tracking-tight">Profile</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
