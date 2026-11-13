package br.com.estreladedavi.rastreador;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RastreadorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
