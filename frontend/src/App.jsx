import React, { useState, useEffect, useMemo } from 'react';
import { api } from './api';
import { Gift, Plus, Users, Wallet, Eye, EyeOff, CheckCircle, LogOut, ArrowRight, UserCheck, Lock, UserPlus, KeyRound, Link as LinkIcon, Home, FolderPlus, LogIn, ArrowLeft, Pencil, X, Copy, Check, AlertCircle, RefreshCw, Shield, Trash2, RotateCcw, Save } from 'lucide-react';

// --- UI COMPONENTS ---
const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-100 ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = "primary", className = "", disabled = false, size = "normal" }) => {
  const base = `rounded-lg font-bold transition-all duration-200 flex items-center justify-center gap-2 ${size === "small" ? "px-3 py-1.5 text-xs" : "px-4 py-3"}`;
  const variants = {
    primary: "bg-red-600 text-white hover:bg-red-700 shadow-md shadow-red-200 disabled:bg-red-300",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:bg-slate-50",
    outline: "border-2 border-slate-200 text-slate-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50",
    ghost: "text-slate-400 hover:text-red-600 hover:bg-red-50",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-200",
    danger: "bg-red-100 text-red-600 hover:bg-red-200"
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

// --- HELPERS ---
const generateId = () => Math.random().toString(36).substr(2, 9);
const normalize = (str) => str?.trim().toLowerCase() || '';

const generateProjectCode = () => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
};

// --- CALCULS METIER ---
const calculateDebts = (expenses, members) => {
  let balances = {};
  let totalSpent = {};
  
  members.forEach(m => {
      balances[m.name] = 0;
      totalSpent[m.name] = 0;
  });

  expenses.forEach(item => {
    if (balances[item.payer] === undefined) balances[item.payer] = 0;
    if (totalSpent[item.payer] === undefined) totalSpent[item.payer] = 0;
    if (item.type === 'settlement' && balances[item.receiver] === undefined) balances[item.receiver] = 0;

    if (item.type === 'settlement') {
      balances[item.payer] += item.amount;
      balances[item.receiver] -= item.amount;
    } else {
      totalSpent[item.payer] += item.amount;
      const participants = (item.involved || []).filter(name => balances[name] !== undefined);
      if (participants.length > 0) {
        const rawShares = item.shares || {};
        const normalizedShares = participants.map(name => {
            const val = parseFloat(rawShares?.[name]);
            return isNaN(val) || val <= 0 ? null : val;
        });
        const hasCustom = normalizedShares.some(v => v !== null);
        const totalWeight = hasCustom ? normalizedShares.reduce((sum, v) => sum + (v || 0), 0) : participants.length;
        if (totalWeight > 0) {
            balances[item.payer] += item.amount;
            participants.forEach((userName, idx) => {
                const weight = hasCustom ? (normalizedShares[idx] || 0) : 1;
                if (weight > 0) {
                    const splitAmount = item.amount * weight / totalWeight;
                    balances[userName] -= splitAmount;
                }
            });
        }
      }
    }
  });

  let debtors = Object.entries(balances).filter(([, amt]) => amt < -0.01).sort((a, b) => a[1] - b[1]);
  let creditors = Object.entries(balances).filter(([, amt]) => amt > 0.01).sort((a, b) => b[1] - a[1]);
  let transactions = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    let debtor = debtors[i];
    let creditor = creditors[j];
    let amount = Math.min(Math.abs(debtor[1]), creditor[1]);
    transactions.push({ from: debtor[0], to: creditor[0], amount: parseFloat(amount.toFixed(2)) });
    debtor[1] += amount;
    creditor[1] -= amount;
    if (Math.abs(debtor[1]) < 0.01) i++;
    if (creditor[1] < 0.01) j++;
  }
  return { balances, transactions, totalSpent };
};

// --- API NORMALIZERS ---
const mapUserFromApi = (payload) => ({
  id: payload?.id,
  username: payload?.username,
  myProjectCodes: payload?.myProjectCodes || payload?.my_project_codes || [],
  isAdmin: !!(payload?.is_admin ?? payload?.isAdmin)
});

const mapProjectFromApi = (proj) => {
  if (!proj) return null;
  return {
    ...proj,
    members: (proj.members || []).map(m => ({
      name: m.name,
      linkedUserId: m.linkedUserId ?? m.linked_user_id ?? null
    })),
    expenses: (proj.expenses || []).map(e => ({
      ...e,
      isBought: e.isBought ?? e.is_bought ?? false,
      shares: e.shares,
      involved: e.involved || [],
      beneficiary: e.beneficiary || '',
      receiver: e.receiver || null
    })),
    subEvents: (proj.sub_events || proj.subEvents || []).map(se => ({
      ...se,
      contributions: (se.contributions || []).map(c => ({
        member: c.member,
        amount: parseFloat(c.amount) || 0
      })),
      items: (se.items || []).map(it => ({
        ...it,
        amount: parseFloat(it.amount) || 0,
        isBought: it.isBought ?? it.is_bought ?? false
      }))
    }))
  };
};

export default function App() {
  // --- GLOBAL STATE ---
  const [globalUser, setGlobalUser] = useState(null); 
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState('AUTH'); // AUTH | CHANGE_PASSWORD | DASHBOARD | ADMIN_DASHBOARD | PROJECT_LINK | PROJECT_HOME
  const [projectsMeta, setProjectsMeta] = useState({});

  // --- PROJECT STATE ---
  const [activeProject, setActiveProject] = useState(null);
  const [currentUserMemberName, setCurrentUserMemberName] = useState(null); 

  // --- AUTH FORMS ---
  const [authMode, setAuthMode] = useState('LOGIN'); 
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');
  
  // --- ADMIN SECURITY FORM ---
  const [changePassForm, setChangePassForm] = useState({ newUsername: '', newPassword: '' });

  // --- DASHBOARD FORMS ---
  const [dashAction, setDashAction] = useState(null); 
  const [dashForm, setDashForm] = useState({ code: '', name: '' });

  // --- ADMIN STATE ---
  const [adminTab, setAdminTab] = useState('PROJECTS'); // PROJECTS | USERS
  const [adminData, setAdminData] = useState({ projects: [], users: [] });

  // --- PROJECT INTERNAL STATE ---
  const [projView, setProjView] = useState('LIST'); 
  const [subEventForm, setSubEventForm] = useState({ id: null, title: '', beneficiary: '', buyer: '', contributions: {}, items: [], created_at: '' });
  const [itemDraft, setItemDraft] = useState({ title: '', amount: '' });
  const [customInput, setCustomInput] = useState({ field: null, value: '' });
  const [editingSubEventId, setEditingSubEventId] = useState(null);
  const [newSettlement, setNewSettlement] = useState({ amount: '', receiver: '' });
  const [flowFilter, setFlowFilter] = useState('all'); // all | sub | settlement

  // --- DATA LOADING ---
  useEffect(() => {
      const loadProjectsMeta = async () => {
          if (!globalUser?.myProjectCodes?.length) {
              setProjectsMeta({});
              return;
          }
          const entries = await Promise.all(
              globalUser.myProjectCodes.map(async code => {
                  try {
                      const proj = await api.getProject(code);
                      return [code, mapProjectFromApi(proj)];
                  } catch (err) {
                      console.error('Impossible de charger le projet', code, err);
                      return null;
                  }
              })
          );
          const meta = {};
          entries.forEach(item => {
              if (item && item[1]) meta[item[0]] = item[1];
          });
          setProjectsMeta(meta);
      };
      loadProjectsMeta();
  }, [globalUser?.id, globalUser?.myProjectCodes?.join(',')]);

  useEffect(() => {
      if (!currentUserMemberName) return;
      setSubEventForm(prev => {
          if (prev.buyer) return prev;
          return { ...prev, buyer: currentUserMemberName };
      });
  }, [currentUserMemberName]);

  // --- 1. AUTHENTICATION LOGIC ---

    const handleAuth = async () => {
      setAuthError('');
      try {
          if (authMode === 'LOGIN') {
              const res = await api.login(authForm.username, authForm.password);
              const user = mapUserFromApi(res);
              setGlobalUser(user);
              setIsAdmin(user.isAdmin);
              if (user.username === 'admin' && authForm.password === 'admin') {
                  setChangePassForm({ newUsername: '', newPassword: '' });
                  setView('CHANGE_PASSWORD');
              } else {
                  setView('DASHBOARD');
              }
              setAuthForm({ username: '', password: '' });
          } else {
              const res = await api.register(authForm.username, authForm.password);
              const user = mapUserFromApi(res);
              user.myProjectCodes = [];
            setGlobalUser(user);
            setIsAdmin(user.isAdmin);
            setView('DASHBOARD');
            setAuthForm({ username: '', password: '' });
        }
    } catch (err) {
        setAuthError(err.message || "Erreur d'authentification");
    }
  };

    const handleSecureAdminAccount = async () => {
        if (!changePassForm.newUsername || !changePassForm.newPassword) {
            alert("Veuillez remplir tous les champs.");
            return;
        }

        try {
            await api.updateUserPassword(globalUser.id, changePassForm.newPassword, changePassForm.newUsername);
            const updatedUser = {
                ...globalUser,
                username: changePassForm.newUsername || globalUser.username,
                needsPasswordChange: false
            };
            setGlobalUser(updatedUser);
            setAuthForm({ username: '', password: '' });
            setView('DASHBOARD');
        } catch (err) {
            alert(err.message || "Impossible de mettre à jour le compte admin");
        }
    };

  const logout = () => {
    setGlobalUser(null);
    setIsAdmin(false);
    setActiveProject(null);
    setView('AUTH');
    setAuthForm({ username: '', password: '' });
    setAuthError('');
  };

  // --- ADMIN ACTIONS ---
  const loadAdminData = async () => {
      try {
          const stats = await api.getAdminStats();
          setAdminData({
              projects: stats.projects || [],
              users: (stats.users || []).map(u => ({
                  ...u,
                  isAdmin: !!(u.is_admin ?? u.isAdmin),
                  myProjectCodes: u.myProjectCodes || u.my_project_codes || []
              }))
          });
      } catch (err) {
          alert("Impossible de charger les données admin");
      }
  };

  const deleteProjectAdmin = async (code) => {
      if(confirm(`Êtes-vous sûr de vouloir supprimer définitivement le projet ${code} ?`)) {
          await api.deleteProject(code);
          if (globalUser?.myProjectCodes?.includes(code)) {
              const updatedUser = { ...globalUser, myProjectCodes: globalUser.myProjectCodes.filter(c => c !== code) };
              setGlobalUser(updatedUser);
          }
          setProjectsMeta(prev => {
              const next = { ...prev };
              delete next[code];
              return next;
          });
          loadAdminData();
      }
  };

  const resetUserPassword = async (user) => {
      const newPass = prompt(`Nouveau mot de passe pour ${user.username}:`, "1234");
      if (newPass) {
          await api.updateUserPassword(user.id, newPass);
          loadAdminData();
      }
  };

  // --- 2. DASHBOARD LOGIC ---

  const handleCreateClick = () => {
      setDashForm({ code: generateProjectCode(), name: '' });
      setDashAction('CREATE');
  };

  const regenerateCode = () => {
      setDashForm(prev => ({ ...prev, code: generateProjectCode() }));
  };

  const createProject = async () => {
      if (!dashForm.name || !dashForm.code) return;
      try {
          await api.createProject(dashForm.name, dashForm.code);
          await api.joinProject(dashForm.code, globalUser.username, true, globalUser.id);
          const updatedUser = { 
              ...globalUser, 
              myProjectCodes: [...new Set([...(globalUser.myProjectCodes || []), dashForm.code])]
          };
          setGlobalUser(updatedUser);
          const proj = await api.getProject(dashForm.code);
          setProjectsMeta(prev => ({ ...prev, [dashForm.code]: mapProjectFromApi(proj) }));
          setDashForm({ code: '', name: '' });
          setDashAction(null);
      } catch (err) {
          alert(err.message || "Impossible de créer le projet");
      }
  };

  const joinProject = async () => {
      if (!dashForm.code) return;
      try {
          const project = await api.getProject(dashForm.code);
          if (!project) { alert("Projet introuvable !"); return; }
          if (!globalUser.myProjectCodes?.includes(dashForm.code)) {
            const updatedUser = { ...globalUser, myProjectCodes: [...(globalUser.myProjectCodes || []), dashForm.code] };
            setGlobalUser(updatedUser);
          }
          setProjectsMeta(prev => ({ ...prev, [dashForm.code]: mapProjectFromApi(project) }));
          setDashForm({ code: '', name: '' });
          setDashAction(null);
      } catch (err) {
          alert("Projet introuvable !");
      }
  };

  const enterProject = async (code) => {
      try {
          const project = await api.getProject(code);
          if(!project) return;
          const normalizedProject = mapProjectFromApi(project);
          setActiveProject(normalizedProject);

          const linkedMember = (normalizedProject.members || []).find(m => m.linkedUserId === globalUser.id);
          
          if (linkedMember) {
              setCurrentUserMemberName(linkedMember.name);
              setView('PROJECT_HOME');
              setProjView('LIST');
              resetSubEventForm(linkedMember.name, normalizedProject);
          } else {
              setView('PROJECT_LINK');
          }
      } catch (err) {
          alert("Impossible de charger ce projet");
      }
  };

  // --- 3. LINKING LOGIC ---

  const linkMember = async (memberName, createNew = false) => {
      try {
          await api.joinProject(activeProject.code, memberName, createNew, globalUser.id);
          const refreshed = await api.getProject(activeProject.code);
          const normalized = mapProjectFromApi(refreshed);
          setActiveProject(normalized);
          const updatedUser = globalUser.myProjectCodes?.includes(activeProject.code)
            ? globalUser
            : { ...globalUser, myProjectCodes: [...(globalUser.myProjectCodes || []), activeProject.code] };
          setGlobalUser(updatedUser);
          setProjectsMeta(prev => ({ ...prev, [activeProject.code]: normalized }));
          setCurrentUserMemberName(memberName);
          setView('PROJECT_HOME');
          setProjView('LIST');
          resetSubEventForm(memberName);
      } catch (err) {
          alert(err.message || "Impossible de lier ce membre");
      }
  };

  // --- 4. PROJECT INTERNAL LOGIC ---

  const refreshActiveProject = async () => {
      if (!activeProject?.code) return;
      const refreshed = await api.getProject(activeProject.code);
      const normalized = mapProjectFromApi(refreshed);
      setActiveProject(normalized);
      setProjectsMeta(prev => ({ ...prev, [activeProject.code]: normalized }));
  };

  const addProjectMember = (name) => {
      if (!name) return;
      if (activeProject.members.find(m => normalize(m.name) === normalize(name))) {
          alert("Ce membre existe deja !");
          return;
      }
      const updatedProject = {
          ...activeProject,
          members: [...activeProject.members, { name: name, linkedUserId: null }]
      };
      setActiveProject(updatedProject);
      setProjectsMeta(prev => ({ ...prev, [activeProject.code]: updatedProject }));
      return name;
  };

  const prepareContributionMap = (beneficiary, currentMap = {}, projectOverride = null) => {
      const map = {};
      const members = projectOverride?.members || activeProject?.members || [];
      members.forEach(m => {
          if (m.name !== beneficiary) {
              map[m.name] = currentMap[m.name] ?? '';
          }
      });
      return map;
  };

  const resetSubEventForm = (buyerName, projectOverride = null) => {
      const proj = projectOverride || activeProject;
      const members = proj?.members || activeProject?.members || [];
      const defaultBuyer = buyerName || currentUserMemberName || (members?.[0]?.name || '');
      setSubEventForm({
          id: null,
          title: '',
          beneficiary: '',
          buyer: defaultBuyer,
          contributions: prepareContributionMap('', {}, proj),
          items: [],
          created_at: new Date().toISOString()
      });
      setItemDraft({ title: '', amount: '' });
      setCustomInput({ field: null, value: '' });
      setEditingSubEventId(null);
  };

  const confirmCustomMember = (field) => {
      const name = customInput.value?.trim();
      if (!name) return;
      const added = addProjectMember(name);
      if (!added) {
          setCustomInput({ field: null, value: '' });
          return;
      }
      if (field === 'beneficiary') {
          setSubEventForm(prev => ({
              ...prev,
              beneficiary: name,
              contributions: prepareContributionMap(name, prev.contributions)
          }));
      } else if (field === 'buyer') {
          setSubEventForm(prev => ({ ...prev, buyer: name }));
      } else if (field === 'contributor') {
          setSubEventForm(prev => ({ ...prev, contributions: { ...prev.contributions, [name]: '' } }));
      }
      setCustomInput({ field: null, value: '' });
  };

  const startEditSubEvent = (subEvent) => {
      const mappedContribs = {};
      (subEvent.contributions || []).forEach(c => { mappedContribs[c.member] = c.amount?.toString() || ''; });
      setSubEventForm({
          id: subEvent.id,
          title: subEvent.title || '',
          beneficiary: subEvent.beneficiary || '',
          buyer: subEvent.buyer || currentUserMemberName || '',
          contributions: prepareContributionMap(subEvent.beneficiary || '', mappedContribs),
          items: (subEvent.items || []).map(it => ({
              id: it.id || generateId(),
              title: it.title || '',
              amount: it.amount ?? 0,
              isBought: !!it.isBought
          })),
          created_at: subEvent.created_at || new Date().toISOString()
      });
      setEditingSubEventId(subEvent.id);
      setItemDraft({ title: '', amount: '' });
      setProjView('ADD');
  };

  const addItemToForm = () => {
      if (!itemDraft.title || !itemDraft.amount) return;
      const amount = parseFloat(itemDraft.amount);
      if (isNaN(amount) || amount <= 0) {
          alert("Montant invalide pour l'item.");
          return;
      }
      setSubEventForm(prev => ({
          ...prev,
          items: [...(prev.items || []), { id: generateId(), title: itemDraft.title, amount, isBought: false }]
      }));
      setItemDraft({ title: '', amount: '' });
  };

  const removeItemFromForm = (id) => {
      setSubEventForm(prev => ({ ...prev, items: (prev.items || []).filter(it => it.id !== id) }));
  };

  const saveSubEvent = async () => {
      if (!subEventForm.title || !subEventForm.buyer || !subEventForm.beneficiary) return;
      const contributions = Object.entries(subEventForm.contributions || {})
        .map(([member, val]) => ({ member, amount: parseFloat(val) }))
        .filter(c => !isNaN(c.amount) && c.amount > 0);
      if (contributions.length === 0) {
          alert("Ajoute au moins un budget positif.");
          return;
      }
      const itemsToSave = (subEventForm.items || [])
        .map(it => ({ ...it, amount: parseFloat(it.amount) || 0, is_bought: !!it.isBought }))
        .filter(it => it.title && it.amount > 0);
      const payload = {
          id: editingSubEventId || subEventForm.id || generateId(),
          title: subEventForm.title,
          beneficiary: subEventForm.beneficiary,
          buyer: subEventForm.buyer,
          contributions,
          items: itemsToSave,
          created_at: subEventForm.created_at || new Date().toISOString()
      };
      try {
          await api.saveSubEvent(activeProject.code, payload);
          await refreshActiveProject();
      } catch (err) {
          alert(err.message || "Impossible d'enregistrer le sous-evenement");
          return;
      }
      resetSubEventForm();
      setProjView('LIST');
  };

  const toggleSubEventItem = async (subEventId, itemId) => {
      const sub = activeProject.subEvents.find(se => se.id === subEventId);
      if (!sub) return;
      const updatedItems = (sub.items || []).map(it => it.id === itemId ? { ...it, isBought: !it.isBought } : it);
      const payload = {
          id: sub.id,
          title: sub.title,
          beneficiary: sub.beneficiary,
          buyer: sub.buyer,
          contributions: (sub.contributions || []).map(c => ({ member: c.member, amount: c.amount })),
          items: updatedItems.map(it => ({ ...it, amount: parseFloat(it.amount) || 0, is_bought: it.isBought })),
          created_at: sub.created_at || new Date().toISOString()
      };
      try {
          await api.saveSubEvent(activeProject.code, payload);
          await refreshActiveProject();
      } catch (err) {
          alert(err.message || "Impossible de mettre a jour l'item");
      }
  };

  const addSettlement = async () => {
    const settlement = {
      id: generateId(),
      type: 'settlement',
      amount: parseFloat(newSettlement.amount),
      payer: currentUserMemberName,
      receiver: newSettlement.receiver,
      date: new Date().toISOString()
    };
    try {
        const payload = { ...settlement, is_bought: false };
        await api.saveExpense(activeProject.code, payload);
        await refreshActiveProject();
    } catch (err) {
        alert(err.message || "Impossible d'ajouter le remboursement");
        return;
    }
    setNewSettlement({ amount: '', receiver: '' });
  };

  const quickSettle = async (from, to, amount) => {
    if (!confirm(`Confirmer le remboursement de ${amount} EUR ?`)) return;
    const settlement = {
      id: generateId(),
      type: 'settlement',
      amount: parseFloat(amount),
      payer: from, 
      receiver: to,
      date: new Date().toISOString()
    };
    try {
        const payload = { ...settlement, is_bought: false };
        await api.saveExpense(activeProject.code, payload);
        await refreshActiveProject();
    } catch (err) {
        alert(err.message || "Impossible d'enregistrer le remboursement");
        return;
    }
  };
// --- COMPUTED ---
  const expenseFlows = useMemo(() => {
      if (!activeProject) return [];
      const legacy = activeProject.expenses || [];
      const subFlows = [];
      (activeProject.subEvents || []).forEach(se => {
          const contributors = (se.contributions || []).filter(c => c.amount > 0);
          if (contributors.length === 0) return;
          const shares = {};
          contributors.forEach(c => { shares[c.member] = c.amount; });
          const involved = contributors.map(c => c.member);
          (se.items || []).forEach(item => {
              const amount = parseFloat(item.amount) || 0;
              if (!item.title || amount <= 0) return;
              subFlows.push({
                  id: `${se.id}-${item.id}`,
                  type: 'expense',
                  title: `${se.title} - ${item.title}`,
                  amount,
                  payer: se.buyer,
                  beneficiary: se.beneficiary || '',
                  involved,
                  shares,
                  isBought: item.isBought,
                  subEventId: se.id,
                  itemId: item.id,
                  date: item.created_at || se.created_at
              });
          });
      });
      return [...legacy, ...subFlows];
  }, [activeProject]);

  const { balances, transactions } = useMemo(() => {
      if(!activeProject) return { balances: {}, transactions: [] };
      return calculateDebts(expenseFlows, activeProject.members);
  }, [activeProject, expenseFlows]);

  const hiddenSubEvents = (activeProject?.subEvents || []).filter(se => se.beneficiary === currentUserMemberName);
  const visibleSubEvents = (activeProject?.subEvents || []).filter(se => se.beneficiary !== currentUserMemberName);
  const settlements = (activeProject?.expenses || []).filter(e => e.type === 'settlement');
  const legacyExpenses = (activeProject?.expenses || []).filter(e => e.type === 'expense');
  const visibleLegacyExpenses = legacyExpenses.filter(e => e.beneficiary !== currentUserMemberName);
  const hiddenCount = hiddenSubEvents.length + (legacyExpenses.length - visibleLegacyExpenses.length);


  // ==========================================
  // VIEW: 1. AUTH SCREEN
  // ==========================================
  if (view === 'AUTH') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 space-y-6 shadow-2xl border-none">
          <div className="text-center space-y-2">
            <div className="bg-red-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-white mb-4 shadow-lg shadow-red-500/50">
              <Gift size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">GiftManager</h1>
            <p className="text-slate-500 text-sm">Gestion de cadeaux multi-projets</p>
          </div>

          <div className="space-y-4">
             <div className="bg-slate-50 p-1 rounded-lg flex text-sm font-bold text-slate-500 mb-4">
                 <button className={`flex-1 py-2 rounded-md transition-all ${authMode === 'LOGIN' ? 'bg-white text-slate-800 shadow-sm' : ''}`} onClick={() => {setAuthMode('LOGIN'); setAuthError('');}}>Connexion</button>
                 <button className={`flex-1 py-2 rounded-md transition-all ${authMode === 'REGISTER' ? 'bg-white text-slate-800 shadow-sm' : ''}`} onClick={() => {setAuthMode('REGISTER'); setAuthError('');}}>Inscription</button>
             </div>

             {authError && (
                 <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm flex items-start gap-2">
                     <AlertCircle size={16} className="mt-0.5 shrink-0"/>
                     {authError}
                 </div>
             )}

             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Identifiant</label>
                <div className="relative mb-3">
                    <input 
                    id="usernameInput"
                    type="text" 
                    placeholder="Votre pseudo" 
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                    value={authForm.username}
                    onChange={e => setAuthForm({...authForm, username: e.target.value})}
                    />
                    <UserCheck className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                </div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Mot de passe</label>
                <div className="relative">
                    <input 
                    type="password" 
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                    value={authForm.password}
                    onChange={e => setAuthForm({...authForm, password: e.target.value})}
                    onKeyDown={e => e.key === 'Enter' && handleAuth()}
                    />
                    <KeyRound className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                </div>
             </div>

             <Button className="w-full" onClick={handleAuth}>
                {authMode === 'LOGIN' ? 'Se connecter' : 'Créer un compte'}
             </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ==========================================
  // VIEW: 1.5 CHANGE PASSWORD (ADMIN SECURITY)
  // ==========================================
  if (view === 'CHANGE_PASSWORD') {
      return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
              <Card className="w-full max-w-md p-8 shadow-2xl border-none space-y-6">
                  <div className="flex items-center gap-3 text-yellow-600 bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                      <Shield size={32} />
                      <div>
                          <h2 className="font-bold text-lg">Sécurisation du compte</h2>
                          <p className="text-xs text-yellow-700">Vous utilisez le compte administrateur par défaut. Veuillez définir vos propres identifiants.</p>
                      </div>
                  </div>

                  <div className="space-y-3">
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nouveau Pseudo Admin</label>
                          <input 
                            type="text" 
                            className="w-full pl-4 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                            value={changePassForm.newUsername}
                            onChange={e => setChangePassForm({...changePassForm, newUsername: e.target.value})}
                            placeholder="Ex: SuperAdmin"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nouveau Mot de passe</label>
                          <input 
                            type="password" 
                            className="w-full pl-4 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                            value={changePassForm.newPassword}
                            onChange={e => setChangePassForm({...changePassForm, newPassword: e.target.value})}
                          />
                      </div>
                  </div>

                  <Button className="w-full" onClick={handleSecureAdminAccount}>
                      <Save size={18} /> Enregistrer et Accéder
                  </Button>
              </Card>
          </div>
      )
  }

  // ==========================================
  // VIEW: 5. ADMIN DASHBOARD
  // ==========================================
  if (view === 'ADMIN_DASHBOARD') {
      return (
          <div className="min-h-screen bg-slate-900 p-4 font-sans">
              <div className="max-w-4xl mx-auto space-y-6">
                  {/* Header */}
                  <div className="flex justify-between items-center text-white pb-4 border-b border-slate-700">
                      <div className="flex items-center gap-3">
                          <div className="bg-red-600 p-2 rounded-lg"><Shield size={24}/></div>
                          <div>
                            <h1 className="text-xl font-bold">Administration</h1>
                            <p className="text-slate-400 text-sm">Connecté en tant que {globalUser.username}</p>
                          </div>
                      </div>
                      <button onClick={() => setView('DASHBOARD')} className="bg-white text-slate-900 px-4 py-2 rounded-lg font-bold hover:bg-slate-200 transition-colors flex items-center gap-2">
                          <Home size={18}/> Retour Dashboard
                      </button>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-4">
                      <button onClick={() => setAdminTab('PROJECTS')} className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${adminTab === 'PROJECTS' ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                          Projets ({adminData.projects.length})
                      </button>
                      <button onClick={() => setAdminTab('USERS')} className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${adminTab === 'USERS' ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                          Utilisateurs ({adminData.users.length})
                      </button>
                  </div>

                  {/* Content */}
                  <Card className="p-0 overflow-hidden bg-slate-800 border-none text-slate-200">
                      {adminTab === 'PROJECTS' ? (
                          <div className="overflow-x-auto">
                              <table className="w-full text-left text-sm">
                                  <thead className="bg-slate-700 text-slate-400 uppercase font-bold">
                                      <tr>
                                          <th className="p-4">Code</th>
                                          <th className="p-4">Nom</th>
                                          <th className="p-4 text-center">Membres</th>
                                          <th className="p-4 text-center">Dépenses</th>
                                          <th className="p-4 text-right">Actions</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-700">
                                      {adminData.projects.length === 0 ? (
                                          <tr><td colSpan="5" className="p-8 text-center text-slate-500">Aucun projet.</td></tr>
                                      ) : adminData.projects.map(proj => (
                                          <tr key={proj.code} className="hover:bg-slate-700/50">
                                              <td className="p-4 font-mono font-bold text-yellow-500">{proj.code}</td>
                                              <td className="p-4 font-bold">{proj.name}</td>
                                              <td className="p-4 text-center text-slate-400">{proj.memberCount}</td>
                                              <td className="p-4 text-center text-slate-400">{proj.expenseCount}</td>
                                              <td className="p-4 text-right">
                                                  <button onClick={() => deleteProjectAdmin(proj.code)} className="text-red-400 hover:text-red-300 p-2 hover:bg-red-900/30 rounded" title="Supprimer définitivement">
                                                      <Trash2 size={16} />
                                                  </button>
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      ) : (
                          <div className="overflow-x-auto">
                              <table className="w-full text-left text-sm">
                                  <thead className="bg-slate-700 text-slate-400 uppercase font-bold">
                                      <tr>
                                          <th className="p-4">ID</th>
                                          <th className="p-4">Identifiant</th>
                                          <th className="p-4">Rôle</th>
                                          <th className="p-4">Projets</th>
                                          <th className="p-4 text-right">Actions</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-700">
                                      {adminData.users.length === 0 ? (
                                          <tr><td colSpan="4" className="p-8 text-center text-slate-500">Aucun utilisateur.</td></tr>
                                      ) : adminData.users.map(user => (
                                          <tr key={user.id} className="hover:bg-slate-700/50">
                                              <td className="p-4 font-mono text-xs text-slate-500">{user.id}</td>
                                              <td className="p-4 font-bold flex items-center gap-2">
                                                  {user.username}
                                                  {user.id === globalUser.id && <span className="bg-green-500 text-black text-[10px] px-1 rounded">MOI</span>}
                                              </td>
                                              <td className="p-4">
                                                  {user.isAdmin ? <span className="text-red-400 font-bold text-xs">ADMIN</span> : <span className="text-slate-500 text-xs">USER</span>}
                                              </td>
                                              <td className="p-4">
                                                  <div className="flex gap-1 flex-wrap">
                                                      {user.myProjectCodes.map(code => (
                                                          <span key={code} className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300">{code}</span>
                                                      ))}
                                                  </div>
                                              </td>
                                              <td className="p-4 text-right">
                                                  <button onClick={() => resetUserPassword(user)} className="text-blue-400 hover:text-blue-300 p-2 hover:bg-blue-900/30 rounded flex items-center gap-1 ml-auto" title="Reset Password">
                                                      <RotateCcw size={16} /> Reset
                                                  </button>
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      )}
                  </Card>
              </div>
          </div>
      )
  }

  // ==========================================
  // VIEW: 2. DASHBOARD
  // ==========================================
  if (view === 'DASHBOARD') {
      return (
          <div className="min-h-screen bg-slate-50 p-4">
             <div className="max-w-md mx-auto space-y-6">
                 {/* Header */}
                 <div className="flex justify-between items-center py-4">
                     <div>
                         <h1 className="text-xl font-bold text-slate-800">Mes Projets</h1>
                         <p className="text-sm text-slate-500">
                             {globalUser.username}
                             {isAdmin && <span className="ml-2 bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold border border-red-200">ADMIN</span>}
                         </p>
                     </div>
                     
                     <div className="flex gap-2">
                         {isAdmin && (
                             <button onClick={() => { setView('ADMIN_DASHBOARD'); loadAdminData(); }} className="p-2 bg-slate-800 text-white rounded-full hover:bg-slate-700 shadow-sm" title="Panneau Admin">
                                 <Shield size={20} />
                             </button>
                         )}
                         <button onClick={logout} className="p-2 bg-white rounded-full text-slate-400 hover:text-red-500 shadow-sm" title="Déconnexion">
                             <LogOut size={20} />
                         </button>
                     </div>
                 </div>

                 {/* Actions */}
                 {dashAction === null ? (
                     <div className="grid grid-cols-2 gap-4">
                         <button onClick={() => { setDashAction('JOIN'); setDashForm({code:'', name:''}); }} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 hover:bg-slate-50 transition-colors">
                             <div className="bg-blue-100 p-3 rounded-full text-blue-600"><LogIn size={24}/></div>
                             <span className="font-bold text-slate-700">Rejoindre</span>
                         </button>
                         <button onClick={handleCreateClick} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 hover:bg-slate-50 transition-colors">
                             <div className="bg-red-100 p-3 rounded-full text-red-600"><FolderPlus size={24}/></div>
                             <span className="font-bold text-slate-700">Créer</span>
                         </button>
                     </div>
                 ) : (
                     <Card className="p-6 animate-in slide-in-from-top-2">
                         <div className="flex justify-between items-center mb-4">
                             <h2 className="font-bold">{dashAction === 'JOIN' ? 'Rejoindre un projet' : 'Nouveau projet'}</h2>
                             <button onClick={() => setDashAction(null)}><X size={20} className="text-slate-400"/></button>
                         </div>
                         <div className="space-y-3">
                             {dashAction === 'CREATE' && (
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase">Nom du projet</label>
                                    <input type="text" className="w-full border-b py-2 outline-none" placeholder="Ex: Noël 2025" value={dashForm.name} onChange={e => setDashForm({...dashForm, name: e.target.value})} />
                                </div>
                             )}
                             <div>
                                 <label className="text-xs font-bold text-slate-400 uppercase">Code du projet</label>
                                 <div className="flex items-center gap-2">
                                     <input 
                                        type="text" 
                                        className="w-full border-b py-2 outline-none uppercase font-mono tracking-widest text-slate-700" 
                                        placeholder="CODE" 
                                        value={dashForm.code} 
                                        onChange={e => setDashForm({...dashForm, code: e.target.value.toUpperCase()})} 
                                        disabled={dashAction === 'CREATE'} 
                                     />
                                     {dashAction === 'CREATE' && (
                                         <button onClick={regenerateCode} className="p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-slate-100" title="Générer un autre code">
                                             <RefreshCw size={18} />
                                         </button>
                                     )}
                                 </div>
                                 <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 bg-slate-50 p-2 rounded">
                                     <Lock size={12} className="shrink-0" /> 
                                     {dashAction === 'CREATE' 
                                        ? "Ce code unique permettra à votre famille de rejoindre le groupe." 
                                        : "Entrez le code communiqué par l'organisateur."
                                     }
                                 </p>
                             </div>
                             <Button onClick={dashAction === 'JOIN' ? joinProject : createProject}>Valider</Button>
                         </div>
                     </Card>
                 )}

                 {/* Project List */}
                 <div className="space-y-3">
                     <h3 className="text-sm font-bold text-slate-400 uppercase">Vos accès</h3>
                     {globalUser.myProjectCodes.length === 0 ? (
                         <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-dashed">
                             <p>Aucun projet pour le moment.</p>
                         </div>
                     ) : (
                         globalUser.myProjectCodes.map(code => {
                             const proj = projectsMeta[code];
                             if (!proj) return (
                                 <div key={code} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
                                     <div>
                                         <div className="font-bold text-slate-800">Chargement...</div>
                                         <div className="text-xs text-slate-400 font-mono bg-slate-100 px-1 rounded inline-block mt-1">{code}</div>
                                     </div>
                                 </div>
                             );
                             return (
                                 <div key={code} onClick={() => enterProject(code)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center cursor-pointer hover:border-red-200 transition-colors group">
                                     <div>
                                         <div className="font-bold text-slate-800">{proj.name}</div>
                                         <div className="text-xs text-slate-400 font-mono bg-slate-100 px-1 rounded inline-block mt-1">{code}</div>
                                     </div>
                                     <ArrowRight className="text-slate-300 group-hover:text-red-500" />
                                 </div>
                             )
                         })
                     )}
                 </div>
             </div>
          </div>
      )
  }

  // ==========================================
  // VIEW: 3. PROJECT LINKING
  // ==========================================
  if (view === 'PROJECT_LINK') {
      const unlinkedMembers = activeProject.members.filter(m => !m.linkedUserId);
      return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
              <Card className="w-full max-w-md p-6 space-y-6">
                  <div className="text-center">
                      <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-blue-600 mb-4">
                        <LinkIcon size={32} />
                      </div>
                      <h2 className="text-xl font-bold">Bienvenue dans "{activeProject.name}"</h2>
                      <p className="text-slate-500 text-sm mt-2">Pour continuer, nous devons savoir qui vous êtes dans ce projet.</p>
                  </div>

                  <div className="space-y-3">
                      <h3 className="text-xs font-bold text-slate-400 uppercase text-center">Option 1 : Je suis nouveau</h3>
                      <Button variant="outline" className="w-full" onClick={() => linkMember(globalUser.username, true)}>
                          Créer le profil "{globalUser.username}"
                      </Button>
                  </div>

                  {unlinkedMembers.length > 0 && (
                      <div className="space-y-3 pt-4 border-t">
                          <h3 className="text-xs font-bold text-slate-400 uppercase text-center">Option 2 : Je suis déjà dans la liste</h3>
                          <p className="text-xs text-center text-slate-400 mb-2">(Sélectionnez votre nom s'il a été créé par quelqu'un d'autre)</p>
                          <div className="grid grid-cols-2 gap-2">
                              {unlinkedMembers.map(m => (
                                  <button key={m.name} onClick={() => linkMember(m.name)} className="p-2 border rounded hover:bg-slate-50 text-sm font-medium">
                                      {m.name}
                                  </button>
                              ))}
                          </div>
                      </div>
                  )}
                  
                  <div className="pt-4 text-center">
                      <button onClick={() => setView('DASHBOARD')} className="text-slate-400 text-sm hover:text-slate-600">Annuler et retourner au dashboard</button>
                  </div>
              </Card>
          </div>
      )
  }

  // ==========================================
  // VIEW: 4. PROJECT HOME (The Actual App)
  // ==========================================
  
  const ProjectHeader = () => (
    <div className="bg-white sticky top-0 z-20 border-b border-slate-200 px-4 py-3 shadow-sm">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
        <button onClick={() => setView('DASHBOARD')} className="text-slate-400 hover:text-slate-600">
            <Home size={20} />
        </button>
        <div className="flex flex-col items-center">
            <span className="font-bold text-slate-700">{activeProject.name}</span>
            <span className="text-[10px] bg-red-100 text-red-700 px-2 rounded-full font-bold uppercase tracking-wider">{currentUserMemberName}</span>
        </div>
        <div className="w-5"></div>
        </div>
    </div>
  );

  const BottomNav = () => (
    <nav className="fixed bottom-0 w-full bg-white border-t border-slate-200 flex justify-around py-3 pb-safe z-40 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        <button onClick={() => setProjView('LIST')} className={`flex flex-col items-center gap-1 ${projView === 'LIST' ? 'text-red-600' : ''}`}>
            <Gift size={22} strokeWidth={2.5} /> Cadeaux
        </button>
        <div className="relative -top-5">
            <button 
                onClick={() => { setProjView('ADD'); setEditingSubEventId(null); setCustomInput({field:null, value:''}); resetSubEventForm(); }} 
                className="bg-red-600 text-white w-14 h-14 rounded-full shadow-lg shadow-red-200 flex items-center justify-center hover:scale-105 transition-transform"
            >
                <Plus size={28} />
            </button>
        </div>
        <button onClick={() => setProjView('BALANCE')} className={`flex flex-col items-center gap-1 ${projView === 'BALANCE' ? 'text-red-600' : ''}`}>
            <Wallet size={22} strokeWidth={2.5} /> Comptes
        </button>
    </nav>
  );

  return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-24 md:pb-10">
          <ProjectHeader />
          <main className="max-w-2xl mx-auto p-4 space-y-6">
              
              {/* --- PROJECT VIEW: LIST --- */}
              {projView === 'LIST' && (
                  <div className="space-y-4 animate-in fade-in">
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        <div className="bg-slate-800 text-white p-4 rounded-xl flex-1 min-w-[140px]">
                            <div className="text-slate-400 text-xs font-bold uppercase mb-1">Ma Balance</div>
                            <div className={`text-2xl font-bold ${balances[currentUserMemberName] >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {balances[currentUserMemberName]?.toFixed(0) || 0} EUR
                            </div>
                        </div>
                        {hiddenCount > 0 && (
                            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-xl flex-1 min-w-[140px] flex flex-col justify-center">
                                <div className="flex items-center gap-2 font-bold text-sm">
                                    <EyeOff size={16} /> Surprise
                                </div>
                                <div className="text-xs mt-1 leading-tight">{hiddenCount} cadeau(x) masque(s).</div>
                            </div>
                        )}
                      </div>

                      <div className="space-y-4">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                              <h2 className="font-bold text-slate-700">Budgets cadeaux</h2>
                              <div className="bg-white border border-slate-200 rounded-full p-1 flex text-[11px] font-bold uppercase tracking-wide">
                                  <button onClick={() => setFlowFilter('all')} className={`px-3 py-1 rounded-full ${flowFilter === 'all' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Global</button>
                                  <button onClick={() => setFlowFilter('sub')} className={`px-3 py-1 rounded-full ${flowFilter === 'sub' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Sous-evenements</button>
                                  <button onClick={() => setFlowFilter('settlement')} className={`px-3 py-1 rounded-full ${flowFilter === 'settlement' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Remboursements</button>
                              </div>
                          </div>

                          {(flowFilter === 'all' || flowFilter === 'sub') && (
                              visibleSubEvents.length === 0 ? (
                                  <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 text-slate-400">
                                      <p>Aucun sous-evenement visible.</p>
                                  </div>
                              ) : visibleSubEvents.map(se => {
                                  const totalBudget = (se.contributions || []).reduce((sum, c) => sum + (c.amount || 0), 0);
                                  const spent = (se.items || []).reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);
                                  const remaining = totalBudget - spent;
                                  return (
                                      <Card key={se.id} className="p-4 flex flex-col gap-4 group">
                                          <div className="flex justify-between items-start">
                                              <div>
                                                  <div className="font-bold text-slate-800">{se.title}</div>
                                                  <div className="text-xs text-slate-500 mt-1">
                                                      Pour <span className="text-purple-600 font-semibold">{se.beneficiary || '???'}</span> ? Acheteur : {se.buyer || '???'}
                                                  </div>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                  <span className={`text-[11px] px-2 py-1 rounded-full font-bold ${remaining >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                                      Reste {remaining.toFixed(0)} EUR
                                                  </span>
                                                  <button onClick={() => startEditSubEvent(se)} className="text-slate-300 hover:text-red-500 p-1"><Pencil size={16} /></button>
                                              </div>
                                          </div>

                                          <div className="grid grid-cols-3 gap-2 text-sm">
                                              <div className="bg-slate-50 rounded-lg p-3">
                                                  <div className="text-xs text-slate-500 uppercase font-bold">Budget</div>
                                                  <div className="font-bold text-slate-800">{totalBudget.toFixed(0)} EUR</div>
                                              </div>
                                              <div className="bg-slate-50 rounded-lg p-3">
                                                  <div className="text-xs text-slate-500 uppercase font-bold">Depense</div>
                                                  <div className="font-bold text-slate-800">{spent.toFixed(0)} EUR</div>
                                              </div>
                                              <div className="bg-slate-50 rounded-lg p-3">
                                                  <div className="text-xs text-slate-500 uppercase font-bold">Reste</div>
                                                  <div className={`font-bold ${remaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{remaining.toFixed(0)} EUR</div>
                                              </div>
                                          </div>

                                          <div>
                                              <div className="text-xs font-bold text-slate-500 uppercase mb-2">Budgets par personne</div>
                                              <div className="flex flex-wrap gap-2">
                                                  {(se.contributions || []).map(c => (
                                                      <span key={`${se.id}-${c.member}`} className="px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-100">{c.member} : {c.amount} EUR</span>
                                                  ))}
                                              </div>
                                          </div>

                                          <div className="pt-2 border-t border-slate-100 space-y-2">
                                              <div className="flex items-center justify-between">
                                                  <span className="text-xs font-bold text-slate-500 uppercase">Items</span>
                                                  <button onClick={() => startEditSubEvent(se)} className="text-[11px] text-red-600 font-bold uppercase">Ajouter / modifier</button>
                                              </div>
                                              {(se.items || []).length === 0 ? (
                                                  <div className="text-sm text-slate-400 bg-slate-50 p-3 rounded-lg">Pas encore d'item.</div>
                                              ) : (se.items || []).map(item => (
                                                  <div key={item.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg p-3">
                                                      <div className="flex items-center gap-3">
                                                          <button onClick={() => toggleSubEventItem(se.id, item.id)} className={`w-6 h-6 rounded-full border ${item.isBought ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 text-slate-400'}`}>
                                                              <CheckCircle size={16} />
                                                          </button>
                                                          <div>
                                                              <div className={`font-semibold ${item.isBought ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.title}</div>
                                                              <div className="text-[11px] text-slate-400">Pris sur {se.title}</div>
                                                          </div>
                                                      </div>
                                                      <div className="font-bold text-slate-800">{(parseFloat(item.amount) || 0).toFixed(0)} EUR</div>
                                                  </div>
                                              ))}
                                          </div>
                                      </Card>
                                  );
                              })
                          )}

                          {(flowFilter === 'all' || flowFilter === 'settlement') && (
                              <Card className="p-4 space-y-3">
                                  <div className="flex items-center justify-between">
                                      <h3 className="text-sm font-bold text-slate-600 uppercase">Remboursements</h3>
                                      <RefreshCw size={16} className="text-slate-300" />
                                  </div>
                                  {settlements.length === 0 ? (
                                      <div className="text-sm text-slate-400 py-4">Aucun remboursement pour le moment.</div>
                                  ) : settlements.map(item => (
                                      <div key={item.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg p-3">
                                          <div>
                                              <div className="font-semibold text-slate-800">{item.payer} ? {item.receiver}</div>
                                              <div className="text-[11px] text-slate-400">Virement</div>
                                          </div>
                                          <div className="font-bold text-slate-800">{item.amount} EUR</div>
                                      </div>
                                  ))}
                              </Card>
                          )}

                          {visibleLegacyExpenses.length > 0 && (
                              <Card className="p-4 space-y-2">
                                  <div className="text-xs font-bold uppercase text-slate-500">Achats historiques</div>
                                  {visibleLegacyExpenses.map(item => (
                                      <div key={item.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg p-3">
                                          <div>
                                              <div className="font-semibold text-slate-800">{item.title}</div>
                                              <div className="text-[11px] text-slate-400">{item.payer} pour {item.beneficiary}</div>
                                          </div>
                                          <div className="font-bold text-slate-800">{item.amount} EUR</div>
                                      </div>
                                  ))}
                              </Card>
                          )}
                      </div>
                  </div>
              )}
{/* --- PROJECT VIEW: ADD/EDIT --- */}
              {projView === 'ADD' && (
                  <div className="animate-in slide-in-from-bottom-4">
                      <div className="flex items-center gap-2 mb-4">
                          <button onClick={() => { setProjView('LIST'); resetSubEventForm(); }} className="p-2 rounded-full hover:bg-slate-100">
                              <ArrowLeft className="w-5 h-5 text-slate-500" />
                          </button>
                          <h2 className="text-xl font-bold">{editingSubEventId ? 'Modifier un sous-evenement' : 'Nouveau sous-evenement'}</h2>
                      </div>
                      <Card className="p-5 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Titre</label>
                                <input type="text" placeholder="Ex: Noel Papa" className="w-full text-lg border-b border-slate-200 py-2 outline-none" value={subEventForm.title} onChange={e => setSubEventForm({...subEventForm, title: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Destinataire</label>
                                {customInput.field === 'beneficiary' ? (
                                    <div className="flex items-center gap-1 border-b border-red-300 py-2">
                                        <input type="text" className="w-full text-sm outline-none text-red-700 font-medium bg-transparent" value={customInput.value} onChange={e => setCustomInput({...customInput, value: e.target.value})} autoFocus placeholder="Nom..." />
                                        <button onClick={() => confirmCustomMember('beneficiary')} className="bg-red-600 text-white rounded-full p-1"><Check size={12}/></button>
                                    </div>
                                ) : (
                                    <select className="w-full text-lg border-b border-slate-200 py-2 outline-none bg-transparent" value={subEventForm.beneficiary} onChange={e => {
                                        if(e.target.value==='__NEW__') { setCustomInput({field:'beneficiary', value:''}); setSubEventForm({...subEventForm, beneficiary:''}); }
                                        else { setSubEventForm({...subEventForm, beneficiary: e.target.value, contributions: prepareContributionMap(e.target.value, subEventForm.contributions)}); }
                                    }}>
                                        <option value="">Choisir...</option>
                                        {activeProject.members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                                        <option value="__NEW__" className="text-red-600 font-bold">+ Nouveau...</option>
                                    </select>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Acheteur</label>
                                {customInput.field === 'buyer' ? (
                                    <div className="flex items-center gap-1 border-b border-red-300 py-2">
                                        <input type="text" className="w-full text-sm outline-none text-red-700 font-medium bg-transparent" value={customInput.value} onChange={e => setCustomInput({...customInput, value: e.target.value})} autoFocus placeholder="Nom..." />
                                        <button onClick={() => confirmCustomMember('buyer')} className="bg-red-600 text-white rounded-full p-1"><Check size={12}/></button>
                                    </div>
                                ) : (
                                    <select className="w-full text-lg border-b border-slate-200 py-2 outline-none bg-transparent" value={subEventForm.buyer} onChange={e => {
                                        if(e.target.value==='__NEW__') { setCustomInput({field:'buyer', value:''}); setSubEventForm({...subEventForm, buyer:''}); }
                                        else { setSubEventForm({...subEventForm, buyer: e.target.value}); }
                                    }}>
                                        <option value="">Choisir...</option>
                                        {activeProject.members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                                        <option value="__NEW__" className="text-red-600 font-bold">+ Nouveau...</option>
                                    </select>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><Users size={12} /> Budget par personne</label>
                                {customInput.field === 'contributor' ? (
                                    <div className="flex items-center gap-1">
                                        <input type="text" className="border px-2 py-1 rounded text-sm" value={customInput.value} onChange={e => setCustomInput({...customInput, value: e.target.value})} placeholder="Nom..." />
                                        <button onClick={() => confirmCustomMember('contributor')} className="bg-red-600 text-white rounded px-2 py-1 text-xs font-bold">OK</button>
                                    </div>
                                ) : (
                                    <button onClick={() => setCustomInput({ field:'contributor', value:'' })} className="text-xs text-red-600 font-bold uppercase">+ Ajouter</button>
                                )}
                            </div>
                            <div className="space-y-2">
                                {activeProject.members
                                    .filter(m => m.name !== subEventForm.beneficiary)
                                    .map(m => (
                                        <div key={m.name} className="flex items-center gap-3 bg-white border border-slate-100 rounded-lg px-3 py-2">
                                            <span className="flex-1 text-sm font-semibold text-slate-700">{m.name}</span>
                                            <input 
                                                type="number" 
                                                min="0" 
                                                step="1" 
                                                className="w-24 text-sm border border-slate-200 rounded px-2 py-1" 
                                                value={subEventForm.contributions?.[m.name] ?? ''} 
                                                onChange={e => setSubEventForm(prev => ({ ...prev, contributions: { ...(prev.contributions || {}), [m.name]: e.target.value } }))} 
                                            />
                                        </div>
                                    ))}
                            </div>
                        </div>

                        {(() => {
                            const budget = Object.values(subEventForm.contributions || {}).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
                            const spent = (subEventForm.items || []).reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);
                            const remaining = budget - spent;
                            return (
                                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 grid grid-cols-3 gap-3 text-sm">
                                    <div>
                                        <div className="text-xs text-slate-500 uppercase font-bold">Budget</div>
                                        <div className="font-bold text-slate-800">{budget.toFixed(0)} EUR</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-500 uppercase font-bold">Items</div>
                                        <div className="font-bold text-slate-800">{spent.toFixed(0)} EUR</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-500 uppercase font-bold">Reste</div>
                                        <div className={`font-bold ${remaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{remaining.toFixed(0)} EUR</div>
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-slate-400 uppercase">Items du cadeau</label>
                            </div>
                            {(subEventForm.items || []).length > 0 && (
                                <div className="space-y-2">
                                    {subEventForm.items.map(item => (
                                        <div key={item.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg p-3">
                                            <div>
                                                <div className="font-semibold text-slate-800">{item.title}</div>
                                                <div className="text-[11px] text-slate-400">{(parseFloat(item.amount) || 0).toFixed(0)} EUR</div>
                                            </div>
                                            <button onClick={() => removeItemFromForm(item.id)} className="text-slate-300 hover:text-red-500 p-1"><X size={16} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="grid grid-cols-3 gap-3 items-end">
                                <div className="col-span-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Item</label>
                                    <input type="text" placeholder="Ex: BD, vinyle..." className="w-full text-lg border-b border-slate-200 py-2 outline-none" value={itemDraft.title} onChange={e => setItemDraft({...itemDraft, title: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase">Montant</label>
                                    <input type="number" placeholder="0" className="w-full text-lg border-b border-slate-200 py-2 outline-none" value={itemDraft.amount} onChange={e => setItemDraft({...itemDraft, amount: e.target.value})} />
                                </div>
                            </div>
                            <Button className="w-full" variant="secondary" onClick={addItemToForm} disabled={!itemDraft.title || !itemDraft.amount}>Ajouter l'item</Button>
                        </div>
                        <Button className="w-full py-4 text-lg" onClick={saveSubEvent} disabled={!subEventForm.title || !subEventForm.beneficiary || !subEventForm.buyer || customInput.field !== null}>Enregistrer</Button>
                      </Card>
                  </div>
              )}
{/* --- PROJECT VIEW: BALANCE --- */}
              {projView === 'BALANCE' && (
                  <div className="space-y-6 animate-in fade-in">
                        {/* DETTES */}
                      <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-xl">
                          <div className="flex justify-between items-start mb-4">
                             <h2 className="text-slate-400 text-sm font-bold uppercase">Remboursements</h2>
                          </div>
                          {transactions.length === 0 ? (
                              <div className="flex flex-col items-center py-8 opacity-50"><CheckCircle size={40} className="mb-3 text-emerald-400"/><p>Équilibré !</p></div>
                          ) : (
                              <div className="space-y-3">
                                  {transactions.map((t, i) => (
                                      <div key={i} className="flex items-center justify-between bg-white/5 border border-white/10 p-3 rounded-lg backdrop-blur-sm">
                                          <div className="flex flex-col">
                                              <div className="flex items-center gap-2 mb-1">
                                                  <span className={t.from === currentUserMemberName ? "font-bold text-white" : "text-slate-300"}>{t.from}</span>
                                                  <ArrowRight size={12} className="text-slate-500"/>
                                                  <span className={t.to === currentUserMemberName ? "font-bold text-white" : "text-slate-300"}>{t.to}</span>
                                              </div>
                                              <div className="font-bold text-emerald-400 text-lg">{t.amount} €</div>
                                          </div>
                                          {(t.from === currentUserMemberName || t.to === currentUserMemberName) && (
                                              <button onClick={() => quickSettle(t.from, t.to, t.amount)} className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 p-2 rounded-lg transition-colors flex flex-col items-center gap-0.5">
                                                  <Check size={18} /> <span className="text-[9px] font-bold uppercase">Régler</span>
                                              </button>
                                          )}
                                      </div>
                                  ))}
                              </div>
                          )}
                          <div className="mt-6 pt-4 border-t border-slate-700">
                             <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Virement manuel</label>
                             <div className="flex gap-2">
                                <select className="bg-slate-700 text-white text-sm rounded px-2 py-2 outline-none" value={newSettlement.receiver} onChange={e => setNewSettlement({...newSettlement, receiver: e.target.value})}>
                                    <option value="">Destinataire...</option>
                                    {activeProject.members.filter(m => m.name !== currentUserMemberName).map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                                </select>
                                <input type="number" placeholder="€" className="bg-slate-700 text-white text-sm rounded w-20 px-2 outline-none" value={newSettlement.amount} onChange={e => setNewSettlement({...newSettlement, amount: e.target.value})} />
                                <button onClick={addSettlement} disabled={!newSettlement.amount || !newSettlement.receiver} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-3 py-1 text-sm font-bold">OK</button>
                             </div>
                          </div>
                      </div>
                  </div>
              )}
          </main>
          <BottomNav />
      </div>
  );
}


