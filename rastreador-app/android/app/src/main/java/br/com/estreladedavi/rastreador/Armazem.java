package br.com.estreladedavi.rastreador;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** Guarda sessao, horario e fila de pontos no proprio aparelho (usado pelo servico e pelo app). */
final class Armazem {
    private static final String PREFS = "rastreador";
    private final SharedPreferences sp;
    private static final Object TRAVA = new Object();

    Armazem(Context c) { sp = c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    String get(String k, String pad) { return sp.getString(k, pad); }
    long getL(String k, long pad) { return sp.getLong(k, pad); }
    boolean getB(String k, boolean pad) { return sp.getBoolean(k, pad); }
    void put(String k, String v) { sp.edit().putString(k, v).apply(); }
    void putL(String k, long v) { sp.edit().putLong(k, v).apply(); }
    void putB(String k, boolean v) { sp.edit().putBoolean(k, v).apply(); }
    void limparSessao() { sp.edit().remove("access").remove("refresh").putBoolean("ativo", false).remove("fila").apply(); }

    void empilhar(JSONObject ponto) {
        synchronized (TRAVA) {
            try {
                JSONArray a = new JSONArray(sp.getString("fila", "[]"));
                a.put(ponto);
                if (a.length() > 2000) {
                    JSONArray b = new JSONArray();
                    for (int i = a.length() - 2000; i < a.length(); i++) b.put(a.get(i));
                    a = b;
                }
                sp.edit().putString("fila", a.toString()).apply();
            } catch (Exception ignored) { }
        }
    }

    JSONArray lote(int max) {
        synchronized (TRAVA) {
            JSONArray r = new JSONArray();
            try {
                JSONArray a = new JSONArray(sp.getString("fila", "[]"));
                for (int i = 0; i < a.length() && i < max; i++) r.put(a.get(i));
            } catch (Exception ignored) { }
            return r;
        }
    }

    void removerInicio(int n) {
        synchronized (TRAVA) {
            try {
                JSONArray a = new JSONArray(sp.getString("fila", "[]"));
                JSONArray b = new JSONArray();
                for (int i = n; i < a.length(); i++) b.put(a.get(i));
                sp.edit().putString("fila", b.toString()).apply();
            } catch (Exception ignored) { }
        }
    }

    int pendentes() {
        synchronized (TRAVA) {
            try { return new JSONArray(sp.getString("fila", "[]")).length(); } catch (Exception e) { return 0; }
        }
    }
}
