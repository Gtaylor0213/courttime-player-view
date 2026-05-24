import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { paymentsApi } from '../../api/client';
import { mergeRegistrationFormData } from '../../../shared/utils/facilityRegistrationForm';
import type { RegistrationFormData, Step1Mode } from './registrationTypes';
import { getRegistrationPathWithMobileSource, parsedHasCreateAccountFields } from './registrationPath';

export interface UseRegistrationWizardParams {
  user: { id?: string; email?: string; fullName?: string } | null;
  formData: RegistrationFormData;
  setFormData: React.Dispatch<React.SetStateAction<RegistrationFormData>>;
  promoCode: string;
  paymentWaived: boolean;
  setPromoCode: (value: string) => void;
  setPaymentWaived: (value: boolean) => void;
  setPaymentSessionId: (value: string | null) => void;
  setPaymentComplete: (value: boolean) => void;
  setAutoSubmitAfterPayment: (value: boolean) => void;
  setRegistrationSessionReady: (value: boolean) => void;
  isMobileRegistration: boolean;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function useRegistrationWizard({
  user,
  formData,
  setFormData,
  promoCode,
  paymentWaived,
  setPromoCode,
  setPaymentWaived,
  setPaymentSessionId,
  setPaymentComplete,
  setAutoSubmitAfterPayment,
  setRegistrationSessionReady,
  isMobileRegistration,
  setErrors,
}: UseRegistrationWizardParams) {
  const [currentStep, setCurrentStep] = useState(1);
  const [step1Mode, setStep1Mode] = useState<Step1Mode>('choose');
  const [loggedInDuringRegistration, setLoggedInDuringRegistration] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const preAuthenticated = !!user && !loggedInDuringRegistration;
  const totalSteps = preAuthenticated ? 6 : 7;

  const persistRegistrationToSession = () => {
    const merged = mergeRegistrationFormData(formData);
    const { facilityImage: _fi, addressWhitelistFile: _af, facilityImagePreview: _fp, ...serializable } = merged;
    sessionStorage.setItem('facilityRegistrationData', JSON.stringify(serializable));
    sessionStorage.setItem('facilityRegistrationStep', String(currentStep));
    sessionStorage.setItem('facilityRegistrationStep1Mode', step1Mode);
    sessionStorage.setItem('facilityRegistrationLoggedInDuring', loggedInDuringRegistration ? 'true' : 'false');
    sessionStorage.setItem('facilityRegistrationPromo', promoCode);
    if (paymentWaived) {
      sessionStorage.setItem('facilityRegistrationWaived', 'true');
    }
  };

  const restoreRegistrationFromSession = (): boolean => {
    const savedData = sessionStorage.getItem('facilityRegistrationData');
    const savedStep = sessionStorage.getItem('facilityRegistrationStep');
    const savedStep1Mode = sessionStorage.getItem('facilityRegistrationStep1Mode');
    const savedLoggedInDuring = sessionStorage.getItem('facilityRegistrationLoggedInDuring') === 'true';
    const savedPromo = sessionStorage.getItem('facilityRegistrationPromo');
    const wasWaived = sessionStorage.getItem('facilityRegistrationWaived') === 'true';

    if (!savedData) return false;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(savedData);
      setFormData((prev) => ({ ...prev, ...parsed }));
    } catch {
      return false;
    }

    if (savedStep) {
      setCurrentStep(parseInt(savedStep, 10));
    }
    if (savedPromo) {
      setPromoCode(savedPromo);
    }
    if (wasWaived) {
      setPaymentWaived(true);
    }
    if (savedLoggedInDuring) {
      setLoggedInDuringRegistration(true);
    }

    if (savedStep1Mode === 'create' || savedStep1Mode === 'login' || savedStep1Mode === 'loggedIn') {
      setStep1Mode(savedStep1Mode);
    } else if (parsedHasCreateAccountFields(parsed)) {
      setStep1Mode('create');
    }

    setRegistrationSessionReady(true);
    return true;
  };

  const clearRegistrationSession = () => {
    sessionStorage.removeItem('facilityRegistrationData');
    sessionStorage.removeItem('facilityRegistrationStep');
    sessionStorage.removeItem('facilityRegistrationStep1Mode');
    sessionStorage.removeItem('facilityRegistrationLoggedInDuring');
    sessionStorage.removeItem('facilityRegistrationPromo');
    sessionStorage.removeItem('facilityRegistrationWaived');
    sessionStorage.removeItem('facilityRegistrationPaymentSessionId');
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const sessionId = urlParams.get('session_id');

    if (paymentStatus === 'success' && sessionId) {
      setRegistrationSessionReady(false);
      const restored = restoreRegistrationFromSession();
      if (!restored) {
        setRegistrationSessionReady(true);
      }

      paymentsApi.verifySession(sessionId).then((result) => {
        const verification = result.data?.data || result.data;
        const wasWaived = sessionStorage.getItem('facilityRegistrationWaived') === 'true';
        if (result.success && verification?.verified) {
          setPaymentSessionId(sessionId);
          sessionStorage.setItem('facilityRegistrationPaymentSessionId', sessionId);
          setPaymentComplete(true);
          setAutoSubmitAfterPayment(true);
          toast.success(
            wasWaived ? 'Card saved! Finishing registration...' : 'Payment successful! Finishing registration...'
          );
        } else {
          toast.error('Payment verification failed. Please try again.');
        }
      });

      window.history.replaceState({}, '', getRegistrationPathWithMobileSource(isMobileRegistration));
    } else if (paymentStatus === 'cancelled') {
      restoreRegistrationFromSession();
      toast.info('Payment was cancelled. You can try again.');
      window.history.replaceState({}, '', getRegistrationPathWithMobileSource(isMobileRegistration));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore on Stripe return only
  }, [isMobileRegistration]);

  const goToStep = (step: number) => {
    if (step >= 1 && step <= totalSteps) {
      setErrors({});
      setCurrentStep(step);
    }
  };

  const handleNext = () => {
    if (!preAuthenticated && currentStep === 1) {
      if (step1Mode === 'choose') {
        toast.error('Please choose to create a new account or log in to an existing one');
        return;
      }
      if (step1Mode === 'login') {
        toast.error('Please complete the login to continue');
        return;
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const getStepLabel = (stepNumber: number): string => {
    if (!preAuthenticated) {
      switch (stepNumber) {
        case 1: return 'Your Account';
        case 2: return 'Facility Info';
        case 3: return 'Courts';
        case 4: return 'Rules';
        case 5: return 'Admins';
        case 6: return 'Review';
        case 7: return 'Payment';
        default: return '';
      }
    }
    switch (stepNumber) {
      case 1: return 'Facility Info';
      case 2: return 'Courts';
      case 3: return 'Rules';
      case 4: return 'Admins';
      case 5: return 'Review';
      case 6: return 'Payment';
      default: return '';
    }
  };

  return {
    currentStep,
    setCurrentStep,
    step1Mode,
    setStep1Mode,
    loggedInDuringRegistration,
    setLoggedInDuringRegistration,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    loginError,
    setLoginError,
    isLoggingIn,
    setIsLoggingIn,
    preAuthenticated,
    totalSteps,
    persistRegistrationToSession,
    restoreRegistrationFromSession,
    clearRegistrationSession,
    getStepLabel,
    goToStep,
    handleNext,
    handleBack,
  };
}
