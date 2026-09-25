package org.sereus.chat

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * ANDROID MUST NOT RESTORE THIS ACTIVITY'S FRAGMENTS, so the saved state is
   * deliberately dropped.
   *
   * `react-native-screens` throws on sight of a restored fragment —
   * "Screen fragments should never be restored" — and the app dies before it can
   * draw anything. Navigation state lives in JavaScript and is rebuilt from
   * scratch on launch, so Android's copy is not just unnecessary, it is wrong.
   *
   * This is not a rare path. The activity is recreated from saved state whenever
   * the OS reclaims the app in the background and the user returns to it, and
   * after a configuration change. It was found by clearing app storage on a
   * Galaxy S7: the process was killed while its state was saved, and every
   * subsequent launch crashed on startup.
   *
   * Required by react-native-screens; see
   * https://github.com/software-mansion/react-native-screens/issues/17#issuecomment-424704067
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "chat"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
