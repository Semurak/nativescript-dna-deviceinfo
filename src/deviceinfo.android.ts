import * as application from '@nativescript/core/application';

import {
  Address,
  AddressType,
  Carrier,
  DeviceInfoInterface,
  DisplayMetrics,
  RadioAccessTechnology,
  StorageVolume,
  wirelessCellularGenerator,
} from './deviceinfo.interface';

import { networkProviderByMcc, networkProviderByMccMnc } from './network-provider';
import { round } from "./utility";

export function staticDecorator<T>() {
  return (constructor: T) => { };
}

const ICE_CREAM_SANDWICH = 14;
const JELLY_BEAN_MR1 = 17;
const JELLY_BEAN_MR2 = 18;
const LOLLIPOP = 21;
const LOLLIPOP_MR1 = 22;

/** Current network is GPRS */
const NETWORK_TYPE_GPRS = 1;
/** Current network is EDGE */
const NETWORK_TYPE_EDGE = 2;
/** Current network is UMTS */
const NETWORK_TYPE_UMTS = 3;
/** Current network is CDMA: Either IS95A or IS95B*/
const NETWORK_TYPE_CDMA = 4;
/** Current network is EVDO revision 0*/
const NETWORK_TYPE_EVDO_0 = 5;
/** Current network is EVDO revision A*/
const NETWORK_TYPE_EVDO_A = 6;
/** Current network is HSDPA */
const NETWORK_TYPE_HSDPA = 8;
/** Current network is HSUPA */
const NETWORK_TYPE_HSUPA = 9;
/** Current network is HSPA */
const NETWORK_TYPE_HSPA = 10;
/** Current network is iDen */
const NETWORK_TYPE_IDEN = 11;
/** Current network is EVDO revision B*/
const NETWORK_TYPE_EVDO_B = 12;
/** Current network is LTE */
const NETWORK_TYPE_LTE = 13;
/** Current network is eHRPD */
const NETWORK_TYPE_EHRPD = 14;
/** Current network is HSPA+ */
const NETWORK_TYPE_HSPAP = 15;
/** Current network is IWLAN */
const NETWORK_TYPE_IWLAN = 18;

const Context = android.content.Context;
const StorageManager = android.os.storage.StorageManager;

type ContextType = android.content.Context;
type SubscriptionManager = android.telephony.SubscriptionManager;
type SubscriptionInfo = android.telephony.SubscriptionInfo;
type StorageManagerType = android.os.storage.StorageManager;
type TelephonyManager = android.telephony.TelephonyManager;

@staticDecorator<DeviceInfoInterface>()
export class DeviceInfo {
  static totalMemory(): number {
    return DeviceInfo.memoryInfo().totalMem;
  }

  static freeMemory(): number {
    return DeviceInfo.memoryInfo().availMem;
  }

  static totalStorageSpace(): number {
    try {
      return DeviceInfo.totalSpace(android.os.Environment.getDataDirectory());
    } catch (exception) {
    }
    return -1;
  }

  static freeStorageSpace(): number {
    try {
      return DeviceInfo.freeSpace(
        android.os.Environment.getDataDirectory());
    } catch (exception) {
    }
    return -1;
  }

  static totalExternalStorageSpace(): number {
    return null;
  }

  static freeExternalStorageSpace(): number {
    return null;
  }

  static deviceId(): string {
    const deviceId = android.os.Build.BOARD;
    if (deviceId) {
      if (!deviceId.toLocaleLowerCase().includes("unknown")) {
        return deviceId;
      }
    }
    return android.os.Build.SERIAL;
  }

  static deviceName(): string {
    let deviceName = "Unknown";
    const ctx = <ContextType>application.android.context;
    if (android.os.Build.VERSION.SDK_INT < 31) {
        const res = ctx.checkCallingOrSelfPermission("android.permission.BLUETOOTH");
        if (res === android.content.pm.PackageManager.PERMISSION_GRANTED) {
            try {
                const adptr = android.bluetooth.BluetoothAdapter.getDefaultAdapter();
                if (adptr) {
                    deviceName = adptr.getName();
                }
            }
            catch (exception) {
            }
        }
    }
    else {
        const res = ctx.checkCallingOrSelfPermission("android.permission.BLUETOOTH_CONNECT");
        if (res === android.content.pm.PackageManager.PERMISSION_GRANTED) {
            try {
                const adptr = ctx.getSystemService(android.content.Context.BLUETOOTH_SERVICE).getAdapter();
                if (adptr) {
                    deviceName = adptr.getName();
                }
            }
            catch (exception) {
            }
        }  
    }      
    return deviceName;
}

  static deviceLocale(): string {
    const ctx = <ContextType>application.android.context;
    const current = ctx.getResources().getConfiguration().locale;
    if (android.os.Build.VERSION.SDK_INT >= LOLLIPOP) {
      return current.getDisplayLanguage();
    } else {
      return String().concat(current.getLanguage(), "-", current.getCountry());
    }
  }

  static deviceCountry(): string {
    const ctx = <ContextType>application.android.context;
    const current = ctx.getResources().getConfiguration().locale;
    return current.getCountry();
  }

  static timezone(): string {
    return java.util.TimeZone.getDefault().getID();
  }

  static userAgent(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      try {
        resolve(android.webkit.WebSettings.getDefaultUserAgent(application.android.context));
      } catch (error) {
        reject(error.message);
      }
    });
  }

  static appName(): string {
    const ctx = <ContextType>application.android.context;
    return ctx.getApplicationInfo().loadLabel(ctx.getPackageManager());
  }

  static appVersion(): string {
    const ctx = <ContextType>application.android.context;
    const pckMgr = ctx.getPackageManager();
    const pckInfo = pckMgr.getPackageInfo(ctx.getPackageName(), 0);
    return pckInfo.versionName;
  }

  static bundleId(): string {
    const ctx = <ContextType>application.android.context;
    return ctx.getPackageName();
  }

  static bundleNumber(): string {
    return "";
  }

  static systemManufacturer(): string {
    return android.os.Build.MANUFACTURER;
  }

  static batteryLevel(): number {
    const BM = android.os.BatteryManager;
    const iFilter = new android.content.IntentFilter(
      android.content.Intent.ACTION_BATTERY_CHANGED);
    const ctx = <ContextType>application.android.context;
    const batteryStatus = ctx.registerReceiver(null, iFilter);
    const level = batteryStatus.getIntExtra(BM.EXTRA_LEVEL, -1);
    const scale = batteryStatus.getIntExtra(BM.EXTRA_SCALE, -1);
    return (level * 100) / scale;
  }

  static cellularServiceProviders(): Carrier[] {
    let carriers = [] as Carrier[];

    const sm = DeviceInfo.subscriptionManager();
    if (sm) {
      const cellularProviders = sm.getActiveSubscriptionInfoList();
      if (cellularProviders) {
        for (let i = 0; i < cellularProviders.size(); i++) {
          let carrier = DeviceInfo.prepareCarrier(cellularProviders.get(i));
          if (carrier.mobileCountryCode === DeviceInfo.activeProviderMcc() &&
            carrier.mobileNetworkCode === DeviceInfo.activeProviderMnc()) {
            carrier.networkType = DeviceInfo.activeProviderRadioAccessTechnology();
            carrier.generation = wirelessCellularGenerator(carrier.networkType);
          }
          carriers.push(carrier);
        }
      }
    }
    else {
      const tm = DeviceInfo.telephonyManager();
      if (tm) {
        let carrier = {} as Carrier;
        carrier.carrierName = tm.getSimOperatorName();
        carrier.displayName = tm.getNetworkOperatorName();
        carrier.isoCountryCode = tm.getNetworkCountryIso();
        carrier.mobileCountryCode = DeviceInfo.activeProviderMcc();
        carrier.mobileNetworkCode = DeviceInfo.activeProviderMnc();

        let provider = networkProviderByMccMnc(carrier.mobileCountryCode,
          carrier.mobileNetworkCode);
        if (provider == null) {
          provider = networkProviderByMcc(carrier.mobileCountryCode);
        }
        carrier.country = provider ? provider.country : "";
        carrier.countryCode = provider ? provider.country_code : "";
        carrier.carrierName = carrier.carrierName === "" && provider ?
          provider.network : carrier.carrierName;
        carrier.isoCountryCode = carrier.isoCountryCode === "" && provider ?
          provider.iso : carrier.isoCountryCode;

        carrier.networkType = DeviceInfo.activeProviderRadioAccessTechnology();
        carrier.generation = wirelessCellularGenerator(carrier.networkType);
        carriers.push(carrier);
      }
    }
    return carriers;
  }

  static externalStoragePaths(): string[] {
    let paths = [] as string[];
    const ctx = <ContextType>application.android.context;
    const sm = <StorageManager>ctx.getSystemService(Context.STORAGE_SERVICE);
    try {
      const method = StorageManager.class.getMethod("getVolumePaths", []);
      method.setAccessible(true);
      const externalPaths = method.invoke(sm, []) as string[];
      for (let i = 0; i < externalPaths.length; i++) {
        const path = externalPaths[i];
        if (DeviceInfo.checkStorageMountState(path)) {
          paths.push(path);
        }
      }
    } catch (error) {
      console.log((<Error>error).message);
    }
    return paths;
  }

  static storageVolumes(): StorageVolume[] {
    let storageVolumesCollection = [] as StorageVolume[];
    const ctx = <ContextType>application.android.context;
    const sm = <StorageManager>ctx.getSystemService(Context.STORAGE_SERVICE);
    try {
      const method = StorageManager.class.getMethod("getVolumeList", []);
      const storageVolumes = method.invoke(sm, []) as android.os.storage.StorageVolume[];
      if (storageVolumes == null || storageVolumes.length <= 0) {
        return [];
      }

      for (let i = 0; i < storageVolumes.length; i++) {
        try {
          const getStateMethod = storageVolumes[i].getClass().getMethod("getState", []);
          const mountState = getStateMethod.invoke(storageVolumes[i], []) as string;
          if (android.os.Environment.MEDIA_MOUNTED === mountState) {
            let sv = {} as StorageVolume;

            let method = storageVolumes[i].getClass().getMethod("getPath", []);
            sv.path = method.invoke(storageVolumes[i], []);

            method = storageVolumes[i].getClass().getMethod("getDescription", [Context.class]);
            sv.description = method.invoke(storageVolumes[i], [ctx]);

            method = storageVolumes[i].getClass().getMethod("isRemovable", []);
            sv.isRemovableStorage = method.invoke(storageVolumes[i], []).booleanValue();

            method = storageVolumes[i].getClass().getMethod("allowMassStorage", []);
            sv.isAllowMassStorage = (method.invoke(storageVolumes[i], []));

            method = storageVolumes[i].getClass().getMethod("isEmulated", []);
            sv.isEmulated = method.invoke(storageVolumes[i], []).booleanValue();

            method = storageVolumes[i].getClass().getMethod("isPrimary", []);
            sv.isPrimary = method.invoke(storageVolumes[i], []).booleanValue();

            const file = new java.io.File(sv.path);
            method = StorageManager.class.getMethod("getStorageLowBytes", [java.io.File.class]);
            sv.lowBytesLimit = method.invoke(sm, [file]).longValue();

            method = StorageManager.class.getMethod("getStorageFullBytes", [java.io.File.class]);
            sv.fullBytesLimit = method.invoke(sm, [file]).longValue();

            sv.totalSize = DeviceInfo.totalSpace(file);
            sv.availableSize = DeviceInfo.freeSpace(file);

            storageVolumesCollection.push(sv);
          }
        } catch (error) {
          console.log(<Error>error.message);
        }
      }
    } catch (error) {
      console.log(<Error>error.message);
    }
    return storageVolumesCollection;
  }

  static wifiSSID(): string {
    const ctx = <ContextType>application.android.context;
    const permission = android.Manifest.permission;
    const contextCompat = DeviceInfo.androidSupport().content.ContextCompat;
    const PackageManager = android.content.pm.PackageManager;

    const permissionCL = permission.ACCESS_COARSE_LOCATION;
    const permissionStatusCL = contextCompat.checkSelfPermission(ctx, permissionCL);
    const permissionPresentForCL = permissionStatusCL === PackageManager.PERMISSION_GRANTED;

    const permissionFL = permission.ACCESS_FINE_LOCATION;
    const permissionStatusFL = contextCompat.checkSelfPermission(ctx, permissionFL);
    const permissionPresentForFL = permissionStatusFL === PackageManager.PERMISSION_GRANTED;

    const permissionWS = permission.ACCESS_WIFI_STATE;
    const permissionStatusWS = contextCompat.checkSelfPermission(ctx, permissionWS);
    const permissionPresentForWS = permissionStatusWS === PackageManager.PERMISSION_GRANTED;

    const permissionPresent = ((permissionPresentForCL || permissionPresentForFL) && permissionPresentForWS);
    if (permissionPresent) {
      const ws = <android.net.wifi.WifiManager>ctx.getSystemService(Context.WIFI_SERVICE);
      const wifiInfo = ws.getConnectionInfo();
      if (wifiInfo.getSupplicantState() === android.net.wifi.SupplicantState.COMPLETED) {
        return wifiInfo.getSSID();
      }
    }
    return "";
  }

  static displayMetrics(): DisplayMetrics {
    const ctx = <ContextType>application.android.context;
    const wm = ctx.getSystemService(Context.WINDOW_SERVICE) as android.view.WindowManager;
    let point = new android.graphics.Point();

    if (android.os.Build.VERSION.SDK_INT >= JELLY_BEAN_MR1) {
      wm.getDefaultDisplay().getRealSize(point);
    }
    else if (android.os.Build.VERSION.SDK_INT >= ICE_CREAM_SANDWICH) {
      try {
        const getRawWidth = android.view.Display.class.getMethod("getRawWidth", []);
        point.x = getRawWidth.invoke(wm.getDefaultDisplay(), []);

        const getRawHeight = android.view.Display.class.getMethod("getRawHeight", []);
        point.y = getRawHeight.invoke(wm.getDefaultDisplay(), []);
      } catch (e) {
        wm.getDefaultDisplay().getSize(point);
      }
    }
    else {
      wm.getDefaultDisplay().getSize(point);
    }

    // const displayMetrics = ctx.getResources().getDisplayMetrics();
    let displayMetrics = new android.util.DisplayMetrics();
    wm.getDefaultDisplay().getRealMetrics(displayMetrics);
    const horizontal = Math.pow(point.x / displayMetrics.xdpi, 2);
    const vertical = Math.pow(point.y / displayMetrics.ydpi, 2);
    const diagonalInInches = Math.sqrt(horizontal + vertical);
    const pixelPerInch = Math.sqrt(Math.pow(point.x, 2) + Math.pow(point.y, 2)) / diagonalInInches;

    let dm = {} as DisplayMetrics;
    dm.scale = round(displayMetrics.scaledDensity, 0);
    dm.widthInPixels = point.x;
    dm.heightInPixels = point.y;
    dm.diagonalInInches = round(diagonalInInches, 1);
    dm.pixelPerInch = round(pixelPerInch, 0);
    return dm;
  }

  static wifiIpv4Address(): string {
    return DeviceInfo.ipv4Address("wlan");
  }

  static cellularIpv4Address(): string {
    return DeviceInfo.ipv4Address("rmnet");
  }

  static dumpIpAddresses(): Address[] {
    return DeviceInfo.ipAddresses();
  }

  static audioVolumeLevel(): number {
    type AudioManager = android.media.AudioManager;
    const AudioManager = android.media.AudioManager;
    const ctx = <ContextType>application.android.context;
    const audioManager = <AudioManager>ctx.getSystemService(Context.AUDIO_SERVICE);
    const musicVolumeLevel = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
    const musicVolumeMax = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
    return Math.round(musicVolumeLevel * 100 / musicVolumeMax);
  }

  static setAudioVolumeLevel(audioVol: number) {
    type AudioManager = android.media.AudioManager;
    const AudioManager = android.media.AudioManager;
    const ctx = <ContextType>application.android.context;
    const audioManager = <AudioManager>ctx.getSystemService(Context.AUDIO_SERVICE);
    const musicVolumeMax = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
    const volumeIndex = Math.round(audioVol * musicVolumeMax * 0.01);
    audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, volumeIndex, 0);
  }

  static screenBrightnessLevel(): number {
    const ctx = <ContextType>application.android.context;
    const cResolver = ctx.getContentResolver();
    try {
      const System = android.provider.Settings.System;
      System.putInt(cResolver, System.SCREEN_BRIGHTNESS_MODE, System.SCREEN_BRIGHTNESS_MODE_MANUAL);
      const brightness = System.getInt(cResolver, System.SCREEN_BRIGHTNESS);
      return brightness / 255.0;
    } catch (error) {
      console.log(<Error>error.message);
    }
    return -1;
  }

  static setScreenBrightnessLevel(level: number) {
    if (!DeviceInfo.checkSystemWritePermission()) {
      DeviceInfo.openAndroidPermissionsMenu();
    }

    if (!DeviceInfo.checkSystemWritePermission()) {
      console.error("Missing System Write Settings Permmissions")
    }

    const brightness = Math.round(level * 255);
    const ctx = <ContextType>application.android.context;
    const cResolver = ctx.getContentResolver();
    const System = android.provider.Settings.System;
    System.putInt(cResolver, System.SCREEN_BRIGHTNESS, brightness);
  }

  static isBluetoothHeadsetConnected(): boolean {
    const BluetoothProfile = android.bluetooth.BluetoothProfile;
    const bluetoothAdapter = DeviceInfo.bluetoothAdapter();
    if (bluetoothAdapter && bluetoothAdapter.isEnabled()) {
      return bluetoothAdapter.getProfileConnectionState(BluetoothProfile.HEADSET) == BluetoothProfile.STATE_CONNECTED;
    }
    return false;
  }

  static isMicAvailable(): boolean {
    const ctx = <ContextType>application.android.context;
    const packageManager = ctx.getPackageManager();
    return packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_MICROPHONE);
  }

  static isBuiltInMicAvailable(): boolean {
    return false;
  }

  static isHeadsetMicAvailable(): boolean {
    return false;
  }

  static isPortrait(): boolean {
    const Configuration = android.content.res.Configuration;
    const ctx = <ContextType>application.android.context;
    return ctx.getResources().getConfiguration().orientation === Configuration.ORIENTATION_PORTRAIT;
  }

  static isTablet(): boolean {
    const Configuration = android.content.res.Configuration;
    const ctx = <ContextType>application.android.context;
    const layout = ctx.getResources().getConfiguration().screenLayout & Configuration.SCREENLAYOUT_SIZE_MASK;
    if (layout !== Configuration.SCREENLAYOUT_SIZE_LARGE && layout !== Configuration.SCREENLAYOUT_SIZE_XLARGE) {
      return false;
    }

    const DisplayMetrics = android.util.DisplayMetrics;
    const metrics = ctx.getResources().getDisplayMetrics();
    if (metrics.densityDpi === DisplayMetrics.DENSITY_DEFAULT || metrics.densityDpi === DisplayMetrics.DENSITY_HIGH
      || metrics.densityDpi === DisplayMetrics.DENSITY_MEDIUM || metrics.densityDpi === DisplayMetrics.DENSITY_TV
      || metrics.densityDpi === DisplayMetrics.DENSITY_XHIGH) {
      return true;
    }
    return false;
  }

  static is24Hour(): boolean {
    return android.text.format.DateFormat.is24HourFormat(application.android.context);
  }

  static isEmulator(): boolean {
    const Build = android.os.Build;
    return (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
      || Build.FINGERPRINT.startsWith("generic")
      || Build.FINGERPRINT.startsWith("unknown")
      || Build.HARDWARE.includes("goldfish")
      || Build.HARDWARE.includes("ranchu")
      || Build.MODEL.includes("google_sdk")
      || Build.MODEL.includes("Emulator")
      || Build.MODEL.includes("Android SDK built for x86")
      || Build.MANUFACTURER.includes("Genymotion")
      || Build.PRODUCT.includes("sdk_google")
      || Build.PRODUCT.includes("google_sdk")
      || Build.PRODUCT.includes("sdk")
      || Build.PRODUCT.includes("sdk_x86")
      || Build.PRODUCT.includes("vbox86p")
      || Build.PRODUCT.includes("emulator");
  }

  static isBatteryCharging(): boolean {
    const BM = android.os.BatteryManager;
    const iFilter = new android.content.IntentFilter(
      android.content.Intent.ACTION_BATTERY_CHANGED);
    const ctx = <ContextType>application.android.context;
    const batteryStatus = ctx.registerReceiver(null, iFilter);
    const chargingStatus = batteryStatus.getIntExtra(BM.EXTRA_STATUS, -1);
    return chargingStatus === BM.BATTERY_STATUS_CHARGING;
  }

  static isLocationEnabled(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const ctx = <ContextType>application.android.context;
      const permission = android.Manifest.permission;
      const contextCompat = DeviceInfo.androidSupport().content.ContextCompat;
      const PackageManager = android.content.pm.PackageManager;

      const permissionFL = permission.ACCESS_FINE_LOCATION;
      const permissionStatusFL = contextCompat.checkSelfPermission(ctx, permissionFL);
      if (permissionStatusFL === PackageManager.PERMISSION_GRANTED) {
        reject(new Error("Missing ACCESS_FINE_LOCATION permission."));
      }
      else {
        type LocationManagerType = android.location.LocationManager;
        const LocationManager = android.location.LocationManager;
        const lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManagerType;

        let gpsEnabled = false;
        try {
          gpsEnabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
        } catch (error) {
        }

        let networkEnabled = false;
        try {
          networkEnabled = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (error) {
        }

        resolve(gpsEnabled && networkEnabled);
      }
    });
  }

  static isBluetoothEnabled(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const permission = android.Manifest.permission;
      const contextCompat = DeviceInfo.androidSupport().content.ContextCompat;
      const PackageManager = android.content.pm.PackageManager;
      const ctx = <ContextType>application.android.context;
      const permissionStatus = contextCompat.checkSelfPermission(ctx, permission.BLUETOOTH);
      if (permissionStatus === PackageManager.PERMISSION_GRANTED) {
        const btAdapter = DeviceInfo.bluetoothAdapter();
        resolve(btAdapter && btAdapter.isEnabled());
      }
      else {
        reject(new Error("Missing bluetooth permission."));
      }
    });
  }

  private static androidSupport() {
    let anyGlobal = global as any;
    if (anyGlobal.androidx && anyGlobal.androidx.core) {
      return anyGlobal.androidx.core;
    }
    else if (android.support && android.support.v4) {
      return android.support.v4;
    }
  }

  private static memoryInfo() {
    const actMgr = <android.app.ActivityManager>(application.getNativeApplication()
      .getSystemService(Context.ACTIVITY_SERVICE));

    const memInfo = new android.app.ActivityManager.MemoryInfo();
    actMgr.getMemoryInfo(memInfo);
    return memInfo;
  }

  private static totalSpace(file: java.io.File): number {
    const statFs = new android.os.StatFs(file.getAbsolutePath());
    return statFs.getBlockCountLong() * statFs.getBlockSizeLong();
  }

  private static freeSpace(file: java.io.File): number {
    const statFs = new android.os.StatFs(file.getAbsolutePath());
    return statFs.getAvailableBlocksLong() * statFs.getBlockSizeLong();
  }

  private static prepareCarrier(cellularProvider: SubscriptionInfo): Carrier {
    let carrier = {} as Carrier;
    carrier.carrierName = cellularProvider.getCarrierName();
    carrier.displayName = cellularProvider.getDisplayName();
    carrier.isoCountryCode = cellularProvider.getCountryIso();
    carrier.mobileCountryCode = cellularProvider.getMcc().toString();

    const mnc = cellularProvider.getMnc().toString();
    carrier.mobileNetworkCode = mnc.length === 1 ? `0${mnc}` : mnc;

    let provider = networkProviderByMccMnc(carrier.mobileCountryCode, carrier.mobileNetworkCode);
    if (provider == null) {
      provider = networkProviderByMcc(carrier.mobileCountryCode);
    }
    carrier.country = provider ? provider.country : "";
    carrier.countryCode = provider ? provider.country_code : "";
    carrier.carrierName = carrier.carrierName === "" && provider ?
      provider.network : carrier.carrierName;
    carrier.isoCountryCode = carrier.isoCountryCode === "" && provider ?
      provider.iso : carrier.isoCountryCode;
    return carrier;
  }

  private static activeProviderRadioAccessTechnology(): RadioAccessTechnology {
    const tm = DeviceInfo.telephonyManager();
    if (tm == null) {
      return RadioAccessTechnology.UNKNOWN;
    }

    const NETWORK_TYPE_NR = 20; // Added in API level 29
    switch (tm.getNetworkType()) {
      case NETWORK_TYPE_CDMA: return RadioAccessTechnology.CDMA;
      case NETWORK_TYPE_EDGE: return RadioAccessTechnology.EDGE;
      case NETWORK_TYPE_EVDO_0: return RadioAccessTechnology.CDMAEVDORev0;
      case NETWORK_TYPE_EVDO_A: return RadioAccessTechnology.CDMAEVDORevA;
      case NETWORK_TYPE_EVDO_B: return RadioAccessTechnology.CDMAEVDORevB;
      case NETWORK_TYPE_GPRS: return RadioAccessTechnology.GPRS;
      case NETWORK_TYPE_HSDPA: return RadioAccessTechnology.HSDPA;
      case NETWORK_TYPE_HSPA: return RadioAccessTechnology.HSPA;
      case NETWORK_TYPE_HSUPA: return RadioAccessTechnology.HSUPA;
      case NETWORK_TYPE_HSPAP: return RadioAccessTechnology.HSPAP;
      case NETWORK_TYPE_UMTS: return RadioAccessTechnology.UMTS;
      case NETWORK_TYPE_EHRPD: return RadioAccessTechnology.EHRPD;
      case NETWORK_TYPE_IDEN: return RadioAccessTechnology.IDEN;
      case NETWORK_TYPE_LTE: return RadioAccessTechnology.LTE;
      case NETWORK_TYPE_IWLAN: return RadioAccessTechnology.IWLAN;
      case NETWORK_TYPE_NR: return RadioAccessTechnology.NR;
      default: return RadioAccessTechnology.UNKNOWN;
    }
  }

  private static activeProviderMcc(): string {
    const tm = DeviceInfo.telephonyManager();
    if (tm) {
      const operator = tm.getSimOperator();
      if (operator !== "") {
        return operator.substring(0, 3);
      }
    }
    return "";
  }

  private static activeProviderMnc(): string {
    const tm = DeviceInfo.telephonyManager();
    if (tm) {
      const operator = tm.getSimOperator();
      if (operator !== "") {
        return operator.substring(3);
      }
    }
    return "";
  }

  private static subscriptionManager(): SubscriptionManager | null {
    const Build = android.os.Build;
    if (Build.VERSION.SDK_INT >= LOLLIPOP_MR1) {
      const ctx = <ContextType>application.android.context;
      const permission = android.Manifest.permission.READ_PHONE_STATE;
      const contextCompat = DeviceInfo.androidSupport().content.ContextCompat;
      const permissionStatus = contextCompat.checkSelfPermission(ctx, permission);
      if (permissionStatus === android.content.pm.PackageManager.PERMISSION_GRANTED) {
        return android.telephony.SubscriptionManager.from(ctx);
      }
    }
    return null;
  }

  private static telephonyManager(): TelephonyManager | null {
    const Build = android.os.Build;
    if (Build.VERSION.SDK_INT >= JELLY_BEAN_MR1) {
      const ctx = <ContextType>application.android.context;
      const permission = android.Manifest.permission.ACCESS_COARSE_LOCATION;
      const contextCompat = DeviceInfo.androidSupport().content.ContextCompat;
      const permissionStatus = contextCompat.checkSelfPermission(ctx, permission);
      if (permissionStatus === android.content.pm.PackageManager.PERMISSION_GRANTED) {
        return ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager;
      }
    }
    return null;
  }

  private static checkStorageMountState(mountPoint: string): boolean {
    if (mountPoint == null) {
      return false;
    }

    const context = <ContextType>application.android.context;
    const storageManager = <StorageManagerType>context.getSystemService(Context.STORAGE_SERVICE);
    try {
      const method = StorageManager.class.getDeclaredMethod(
        "getVolumeState",
        [java.lang.String.class]);
      method.setAccessible(true);

      const mountState = method.invoke(storageManager, [mountPoint]) as string;
      return android.os.Environment.MEDIA_MOUNTED === mountState;
    } catch (error) {
      console.log(<Error>error.message);
    }
    return false;
  }

  private static ipv4Address(interfaceName: string): string {
    const addresses = DeviceInfo.ipAddresses();
    const foundAddress = addresses.find(addr => {
      if (addr.adapterName && addr.adapterName.includes(interfaceName)) {
        if (addr.type == AddressType.IPv4) {
          return true;
        }
      }
      return false;
    });
    return foundAddress ? foundAddress.address : ""
  }

  private static ipAddresses(): Address[] {
    type InetAddress = java.net.InetAddress;
    type NetworkInterface = java.net.NetworkInterface
    const NetworkInterface = java.net.NetworkInterface;
    const Collections = java.util.Collections;
    let addresses: Address[] = [];
    try {
      const interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
      for (let index = 0; index < interfaces.size(); index++) {
        const netInterface: NetworkInterface = interfaces.get(index);
        const displayName = netInterface.getDisplayName();
        const addrs = Collections.list(netInterface.getInetAddresses());
        for (let addrIndex = 0; addrIndex < addrs.size(); addrIndex++) {
          const addr: InetAddress = addrs.get(addrIndex);
          const hostAddr = addr.getHostAddress();
          const addrType = hostAddr.indexOf(':') < 0 ? AddressType.IPv4 : AddressType.IPv6;
          addresses.push({ address: hostAddr, type: addrType, adapterName: displayName });
        }
      }
    } catch (Exception) {
    }
    return addresses;
  }

  private static bluetoothAdapter(): android.bluetooth.BluetoothAdapter {
    type BluetoothManagerType = android.bluetooth.BluetoothManager;
    type BluetoothAdapter = android.bluetooth.BluetoothAdapter;
    const BluetoothAdapter = android.bluetooth.BluetoothAdapter;
    const Build = android.os.Build;
    const ctx = <ContextType>application.android.context;
    let btAdapter: BluetoothAdapter = null;

    if (Build.VERSION.SDK_INT > JELLY_BEAN_MR1) {
      const btm = <BluetoothManagerType>ctx.getSystemService(Context.BLUETOOTH_SERVICE);
      btAdapter = btm ? btm.getAdapter() : null;
    }
    else {
      btAdapter = BluetoothAdapter.getDefaultAdapter();
    }
    return btAdapter;
  }

  private static checkSystemWritePermission(): boolean {
    const System: any = android.provider.Settings.System;
    const Build = android.os.Build;
    if (Build.VERSION.SDK_INT >= 23 /*Build.VERSION_CODES.M*/) {
      const ctx = <ContextType>application.android.context;
      if (System.canWrite(ctx)) {
        return true;
      }
    }
    else {
      // ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_SETTINGS) == PackageManager.PERMISSION_GRANTED;
    }
    return false;
  }

  private static openAndroidPermissionsMenu() {
    const ctx = <ContextType>application.android.context;
    const Settings: any = android.provider.Settings;
    const Build = android.os.Build;
    if (Build.VERSION.SDK_INT >= 23 /*Build.VERSION_CODES.M*/) {
      const intent = new android.content.Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS);
      intent.setData(android.net.Uri.parse("package:" + ctx.getPackageName()));
      ctx.startActivity(intent);
    }
  }
}
