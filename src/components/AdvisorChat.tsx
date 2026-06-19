import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, MessageSquare, AlertCircle, RefreshCw, Compass, X } from 'lucide-react';
import { AssistantMessage, CityConfig, GasStation } from '../types';

interface AdvisorChatProps {
  city: CityConfig;
  selectedFuel: string;
  stations: GasStation[];
  onClose?: () => void;
}

export default function AdvisorChat({ city, selectedFuel, stations, onClose }: AdvisorChatProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'init-msg',
      role: 'assistant',
      content: city.id === 'sf'
        ? `Hello! I'm your **GeoGas Smart AI Fuel Advisor**. Ask me to compare local stations, determine full-tank costs, suggest refueling spots, or give high-performance fuel advice for your car model!`
        : `¡Hola! Soy tu **Asesor de Combustible Inteligente de GeoGas**. Consúltame para comparar las gasolineras más baratas de Tenerife, estimar el coste de tus depósitos preferidos o predecir tendencias de repostaje.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputVal, setInputVal] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    setMessages([
      {
        id: `init-${city.id}`,
        role: 'assistant',
        content: city.id === 'sf'
          ? `Welcome to **San Francisco context**. I have grounded myself in local station pricing like $4.12 for FastFuel, $4.15 for Valero, etc. Ask me about optimization tips or estimated costs to fill up!`
          : `Bienvenido al contexto de **Santa Cruz de Tenerife**. Me he sincronizado con los precios de la zona (p. ej. Repsol, Cepsa, Disa). Pregúntame sobre rutas económicas o gasolineras ideales.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  }, [city]);

  const handleSend = async (textToSend?: string) => {
    const rawVal = textToSend || inputVal;
    if (!rawVal.trim() || isLoading) return;

    if (!textToSend) {
      setInputVal('');
    }
    setErrorMsg(null);

    const userMsg: AssistantMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: rawVal,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          city: city.id,
          selectedFuel,
          stations,
        }),
      });

      if (!response.ok) {
        throw new Error('API failed. Confirm GEMINI_API_KEY secret is correctly entered in Secrets side-panel.');
      }

      const data = await response.json();
      
      setMessages(prev => [...prev, {
        id: `msg-reply-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(city.id === 'sf' 
        ? 'AI server error. Please ensure GEMINI_API_KEY is configured under Settings!' 
        : 'Error del servidor de IA. ¡Asegúrese de configurar GEMINI_API_KEY en los secretos!');
    } finally {
      setIsLoading(false);
    }
  };

  const QUICK_PROMPTS = city.id === 'sf'
    ? [
        { label: 'Cheapest Station Analysis', prompt: 'Which gas station in San Francisco provides the absolute best value and how much can I save on a 12 gallon tank?' },
        { label: 'Difference G95 vs G98', prompt: 'Explain the technical premium differences of high octane fuels and if regular is fine.' },
        { label: 'Suggest Travel stops', prompt: 'What is the standard price trend this week and which stations are open 24 hours?' },
      ]
    : [
        { label: 'Análisis de Ahorros', prompt: '¿Cuál es la gasolinera más barata de Tenerife esta semana y cuántos euros ahorraría en un depósito de 50 Litros?' },
        { label: '¿G95 E5 o G98 E5?', prompt: 'Explícame las diferencias técnicas entre gasolina 95 y 98 sin tecnicismos.' },
        { label: 'Estaciones 24 Horas', prompt: '¿Qué estaciones permanecen disponibles las 24 horas y cuál tiene el mejor precio de Diesel?' },
      ];

  const renderMarkdownText = (text: string) => {
    return text.split('\n').map((line, lineIdx) => {
      const isListItem = line.trim().startsWith('- ') || line.trim().startsWith('* ');
      const cleanLine = isListItem ? line.trim().substring(2) : line;

      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = boldRegex.exec(cleanLine)) !== null) {
        if (match.index > lastIndex) {
          parts.push(cleanLine.substring(lastIndex, match.index));
        }
        parts.push(<strong key={match.index} className="text-emerald-400 font-semibold">{match[1]}</strong>);
        lastIndex = boldRegex.lastIndex;
      }

      if (lastIndex < cleanLine.length) {
        parts.push(cleanLine.substring(lastIndex));
      }

      const formattedContent = parts.length > 0 ? parts : cleanLine;

      if (isListItem) {
        return (
          <li key={lineIdx} className="ml-4 list-disc list-outside mb-1 text-zinc-300">
            {formattedContent}
          </li>
        );
      }

      return line.trim() === '' ? (
        <div key={lineIdx} className="h-2" />
      ) : (
        <p key={lineIdx} className="mb-2 leading-relaxed text-zinc-200">
          {formattedContent}
        </p>
      );
    });
  };

  return (
    <div className="flex flex-col h-[520px] md:h-full md:flex-1 md:min-h-0 bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative">
      <div className="p-4 bg-zinc-900/60 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <h4 className="font-semibold text-sm text-zinc-100 flex items-center gap-1.5">
              GeoGas AI Advisor
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
            </h4>
            <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">
              Grounded Gemini 3.5
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              setMessages([
                {
                  id: `reset-${Date.now()}`,
                  role: 'assistant',
                  content: city.id === 'sf' 
                    ? 'History cleared! Ask me anything regarding San Francisco fuel stations.'
                    : '¡Historial restaurado! Hazme cualquier consulta sobre Tenerife.',
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                }
              ]);
              setErrorMsg(null);
            }}
            className="text-xs font-semibold text-zinc-400 hover:text-rose-400 flex items-center gap-1 bg-zinc-800/40 px-2.5 py-1.5 rounded-full transition-colors border border-white/5 cursor-pointer"
            title="Reset Advice History"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {city.id === 'sf' ? 'Reset' : 'Reiniciar'}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 bg-zinc-800/40 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 rounded-full border border-white/5 transition-colors cursor-pointer"
              title="Close AI Advisor"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 max-h-[380px] md:max-h-none">
        {messages.map(msg => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${
                isUser 
                  ? 'bg-zinc-800 text-zinc-300 border border-zinc-700' 
                  : 'bg-emerald-500 text-zinc-950 font-bold'
                }`}
              >
                {isUser ? 'U' : <Compass className="w-4 h-4 fill-current" />}
              </div>

              <div>
                <div className={`p-4 rounded-2xl shadow-inner text-xs ${
                  isUser
                    ? 'bg-emerald-500 text-zinc-950 rounded-tr-sm font-medium'
                    : 'bg-zinc-900 border border-white/5 rounded-tl-sm text-zinc-300'
                }`}>
                  {isUser ? <p>{msg.content}</p> : renderMarkdownText(msg.content)}
                </div>
                <span className={`block text-[10px] text-zinc-500 mt-1 ${isUser ? 'text-right mr-1' : 'ml-1'}`}>
                  {msg.timestamp}
                </span>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-start gap-2.5 mr-auto">
            <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-xs shrink-0 text-zinc-950 font-bold">
              <Compass className="w-4 h-4 fill-current animate-spin" />
            </div>
            <div className="p-4 bg-zinc-900 border border-white/5 rounded-2xl rounded-tl-sm max-w-[85%]">
              <div className="flex gap-1.5 py-1">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p>{errorMsg}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 py-2 border-t border-white/5 bg-zinc-950/40 flex gap-2 overflow-x-auto scrollbar-station whitespace-nowrap">
        {QUICK_PROMPTS.map((qp, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(qp.prompt)}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-[11px] text-zinc-400 hover:text-emerald-400 border border-white/5 transition-all active:scale-95 duration-100 shrink-0"
          >
            {qp.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3.5 bg-zinc-900/80 border-t border-white/10 flex items-center gap-2"
      >
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder={city.id === 'sf' ? 'Ask fuel advisor...' : 'Pregunta algo sobre combustible...'}
          className="flex-1 bg-zinc-950 border border-white/5 focus:border-emerald-500/30 rounded-full px-4 py-2 text-xs text-zinc-200 outline-none"
          disabled={isLoading}
        />
        <button
          type="submit"
          className="p-2 ml-1 rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md transition-colors active:scale-90"
          disabled={isLoading || !inputVal.trim()}
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
