import { useState, useEffect } from 'react';
import * as React from 'react';
import AsyncSelect from 'react-select/async';
import Select from 'react-select'; // Commit ajout de la bibliothèque Select pour la liste déroulante
import { useTranslation } from 'react-i18next';
import MemberAPI from '../../api/member';
import { User } from '../../models/user';
import { SelectOption } from '../../models/select';

interface MemberSelectProps {
  defaultUser?: User,
  value?: User,
  //Commit modifié pour inclure le projet
  onSelected?: (user: { id: number, name: string, project?: string}) => void,
  noHeader?: boolean,
  hasError?: boolean
}

/**
 * Commit options de projet pour la liste déroulante
 */
const projectOptions: Array<SelectOption<string>> = [
  { value: 'projet_ingenieur_9_mois', label: 'Projet ingénieur (9 mois)' },
  { value: 'projet_personnel_1_mois', label: 'Projet personnel (1 mois)' }
];

/**
 * This component allows privileged users (managers/admins) to select a user on whose behalf to act.
 */
export const MemberSelect: React.FC<MemberSelectProps> = ({ defaultUser, value, onSelected, noHeader, hasError }) => {
  const { t } = useTranslation('public');
  const [option, setOption] = useState<SelectOption<number>>();

  // Commit état pour le projet sélectionné
  const [selectedProject, setSelectedProject] = useState<SelectOption<string>>(null);

  useEffect(() => {
    if (defaultUser) {
      setOption({ value: defaultUser.id, label: defaultUser.name });
    }
  }, []);

  useEffect(() => {
    if (!defaultUser && option) {
      onSelected({ id: option.value, name: option.label, project: selectedProject?.value });
    }
    if (!option && defaultUser) {
      setOption({ value: defaultUser.id, label: defaultUser.name });
    }
  }, [defaultUser]);

  useEffect(() => {
    if (value && value?.id !== option?.value) {
      setOption({ value: value.id, label: value.name });
    }
    if (!value) {
      setOption(null);
      // Commit réinitialiser le projet si aucun utilisateur n’est sélectionné
      setSelectedProject(null);
    }
  }, [value]);

  /**
   * search members by name
   */
  const loadMembers = async (inputValue: string): Promise<Array<SelectOption<number>>> => {
    if (!inputValue) {
      return [];
    }
    const data = await MemberAPI.search(inputValue);
    return data.map(u => {
      return { value: u.id, label: u.name };
    });
  };

  /**
   * Commit renaming the callback for handle select changed
   */
  const onChangeMember = (v: SelectOption<number>) => {
    setOption(v);
    // Commit
    onSelected({ id: v.value, name: v.label, project: selectedProject?.value });
  };

  /**
   * Commit callback for handle project selection changed
   */
  const onChangeProject = (v: SelectOption<string>) => {
    setSelectedProject(v);
    if (option) {
      onSelected({ id: option.value, name: option.label, project: v.value });
    }
  };

  return (
    <div className={`member-select ${hasError ? 'error' : ''}`}>
      {!noHeader &&
        <div className="member-select-header">
          <h3 className="member-select-title">{t('app.public.member_select.select_a_member')}</h3>
        </div>
      }
      <AsyncSelect placeholder={t('app.public.member_select.start_typing')}
                   className="select-input"
                   cacheOptions
                   loadOptions={loadMembers}
                   defaultOptions
                   onChange={onChangeMember}
                   value={option}
                   defaultInputValue={defaultUser?.name}
      />
    </div>
  );
};

MemberSelect.defaultProps = {
  hasError: false
};
