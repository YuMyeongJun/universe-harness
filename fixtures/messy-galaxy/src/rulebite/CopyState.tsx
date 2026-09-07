/* 일부러 어긴다 — quality/copy-state. 이 파일은 generate.mjs 가 만든다. 손으로 고치지 마라. */
interface IWizardStepProps {
initialCategory?: string;
}

export const WizardStep = ({ initialCategory }: IWizardStepProps) => {
const [category, setCategory] = useState(initialCategory);
return category;
};
