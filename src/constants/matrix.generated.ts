export interface MatrixIndicator {
  id: string;
  description: string;
  requiredDocs: string[];
  instruments: string;
  source: string;
}

export interface MatrixCriterion {
  id: string;
  name: string;
  indicators: MatrixIndicator[];
}

export interface MatrixDimension {
  id: string;
  name: string;
  criteria: MatrixCriterion[];
}

export const OFFICIAL_MATRIX: MatrixDimension[] = [
  {
    "id": "1",
    "name": "Gestion y aseguramiento de la calidad",
    "criteria": [
      {
        "id": "1.1",
        "name": "Pertinencia de la formalizacion y funcionamiento de la gestion academica",
        "indicators": [
          {
            "id": "1.1.a",
            "description": "Reglamentos, normas, procedimientos y disposiciones basicas que orientan la carrera.",
            "requiredDocs": [
              "Reglamento institucional",
              "reglamento academico",
              "manual de funciones",
              "protocolo de inclusion",
              "protocolo de seguridad",
              "protocolo o plan de seguimiento a egresados",
              "resoluciones de aprobacion y actualizacion."
            ],
            "instruments": "Lista de cotejo documental por indicador; entrevista a directivos; encuesta a estudiantes y docentes para verificar conocimiento y aplicacion.",
            "source": "Rectorado, direccion academica, coordinacion de carrera, secretaria academica."
          },
          {
            "id": "1.1.b",
            "description": "Estructura organizativa, funciones y funcionamiento de la gestion academica.",
            "requiredDocs": [
              "Organigrama",
              "resoluciones de designacion",
              "perfiles de cargo",
              "actas de coordinacion",
              "plan operativo o cronograma academico",
              "registros de reuniones."
            ],
            "instruments": "Ficha de revision documental; entrevista a autoridades; matriz de roles y funciones.",
            "source": "Rectorado, direccion, coordinacion de carrera, talento humano."
          },
          {
            "id": "1.1.c",
            "description": "Mecanismos de comunicacion interna, informacion oportuna y participacion de actores.",
            "requiredDocs": [
              "Plan o protocolo de comunicacion",
              "evidencias de circulares, comunicados y avisos",
              "actas de reuniones",
              "registros de canales oficiales",
              "informes de medios de comunicacion."
            ],
            "instruments": "Encuesta a estudiantes, docentes y directivos; ficha de verificacion de canales; entrevista a responsables de comunicacion.",
            "source": "Comunicacion institucional, secretaria academica, coordinacion de carrera."
          }
        ]
      },
      {
        "id": "1.2",
        "name": "Integridad del aseguramiento de la calidad",
        "indicators": [
          {
            "id": "1.2.a",
            "description": "Desarrollo de autoevaluacion diagnostica con trazabilidad y organizacion del proceso.",
            "requiredDocs": [
              "Resolucion de conformacion del comite",
              "agenda de trabajo",
              "cronograma",
              "matriz de criterios e indicadores",
              "actas",
              "informes parciales",
              "repositorio organizado de evidencias."
            ],
            "instruments": "Matriz de trazabilidad por indicador; lista de cotejo de avance; entrevista a comite; ficha de seguimiento de actividades.",
            "source": "Comite de autoevaluacion, direccion de carrera, rectorado."
          },
          {
            "id": "1.2.b",
            "description": "Principios de etica, confidencialidad y resguardo de informacion en el proceso.",
            "requiredDocs": [
              "Protocolo de confidencialidad",
              "actas de compromiso",
              "formatos de consentimiento si aplica",
              "lineamientos de resguardo",
              "registros de custodia y acceso a la informacion."
            ],
            "instruments": "Lista de cotejo de cumplimiento etico; encuesta a actores participantes; entrevista a responsables del comite.",
            "source": "Comite de autoevaluacion, asesoria juridica o secretarias responsables."
          },
          {
            "id": "1.2.c",
            "description": "Uso de resultados de autoevaluacion para la mejora institucional.",
            "requiredDocs": [
              "Plan de mejora",
              "informes de resultados",
              "actas de socializacion",
              "cronograma de seguimiento",
              "evidencias de acciones implementadas."
            ],
            "instruments": "Matriz de seguimiento del plan de mejora; entrevista a autoridades; encuesta a estudiantes, docentes y directivos sobre conocimiento de mejoras.",
            "source": "Comite de autoevaluacion, direccion academica, coordinacion de carrera."
          }
        ]
      },
      {
        "id": "1.3",
        "name": "Pertinencia de la vinculacion temprana con el entorno",
        "indicators": [
          {
            "id": "1.3.a",
            "description": "Existencia de mecanismos formales de vinculacion con actores del entorno.",
            "requiredDocs": [
              "Convenios marco y especificos",
              "cartas de intencion",
              "actas de reuniones con actores externos",
              "registros de actividades de vinculacion."
            ],
            "instruments": "Matriz de convenios y estado de vigencia; entrevista a coordinacion y actores externos; ficha de seguimiento de actividades de vinculacion.",
            "source": "Rectorado, extension, coordinacion de carrera, aliados externos."
          },
          {
            "id": "1.3.b",
            "description": "Actividades de vinculacion que fortalecen la formacion del estudiante.",
            "requiredDocs": [
              "Programas de extension",
              "informes de actividades",
              "registros de participacion estudiantil",
              "evidencias fotograficas o de asistencia",
              "reportes de resultados."
            ],
            "instruments": "Encuesta a estudiantes; entrevista a docentes y responsables de extension; ficha de sistematizacion de actividades.",
            "source": "Extension, coordinacion academica, docentes, estudiantes."
          },
          {
            "id": "1.3.c",
            "description": "Retroalimentacion del entorno utilizada para ajustar o fortalecer la carrera.",
            "requiredDocs": [
              "Informes de consulta a empleadores o actores externos",
              "actas de analisis",
              "ajustes curriculares",
              "resoluciones de aprobacion",
              "informes de retroalimentacion."
            ],
            "instruments": "Entrevista a empleadores o aliados; matriz de analisis de retroalimentacion; lista de cotejo de cambios implementados.",
            "source": "Coordinacion de carrera, comite curricular, actores externos."
          }
        ]
      },
      {
        "id": "1.4",
        "name": "Oportunidad de las iniciativas de investigacion y extension",
        "indicators": [
          {
            "id": "1.4.a",
            "description": "Inicio temprano de actividades de investigacion y extension en la trayectoria formativa.",
            "requiredDocs": [
              "Resoluciones o lineamientos de investigacion y extension",
              "planes de actividades",
              "proyectos",
              "convocatorias",
              "registros de participacion estudiantil."
            ],
            "instruments": "Matriz de proyectos por cohorte; encuesta a estudiantes y docentes; entrevista a coordinadores de investigacion y extension.",
            "source": "Investigacion, extension, coordinacion academica."
          },
          {
            "id": "1.4.b",
            "description": "Desarrollo oportuno de investigacion y extension segun avance academico y plan de estudios.",
            "requiredDocs": [
              "Malla curricular",
              "cronogramas",
              "proyectos vinculados a cursos",
              "programas de asignatura",
              "informes de actividades por semestre o curso."
            ],
            "instruments": "Matriz de correspondencia plan de estudios-actividades; entrevista a docentes; encuesta a estudiantes.",
            "source": "Coordinacion academica, docentes, comite curricular."
          },
          {
            "id": "1.4.c",
            "description": "Respuesta de las iniciativas de investigacion y extension a necesidades reales del entorno.",
            "requiredDocs": [
              "Diagnosticos del entorno",
              "convenios",
              "proyectos con justificacion",
              "informes de impacto",
              "actas con organizaciones externas."
            ],
            "instruments": "Entrevista a actores externos; ficha de pertinencia de proyectos; matriz de vinculacion problema-accion-resultado.",
            "source": "Extension, investigacion, aliados externos, coordinacion de carrera."
          }
        ]
      }
    ]
  },
  {
    "id": "2",
    "name": "Implementacion del proyecto academico",
    "criteria": [
      {
        "id": "2.1",
        "name": "Eficacia en el cumplimiento del plan de estudios",
        "indicators": [
          {
            "id": "2.1.a",
            "description": "Cumplimiento de la carga horaria prevista en la oferta academica.",
            "requiredDocs": [
              "Plan de estudios aprobado",
              "malla curricular",
              "horarios",
              "calendarios academicos",
              "registros de clase",
              "planillas de cumplimiento de carga horaria."
            ],
            "instruments": "Lista de cotejo de carga horaria; revision documental de horarios y planillas; encuesta a estudiantes y docentes.",
            "source": "Secretaria academica, coordinacion de carrera, docentes."
          },
          {
            "id": "2.1.b",
            "description": "Desarrollo de clases teoricas y practicas conforme a lo planificado.",
            "requiredDocs": [
              "Programas de asignatura",
              "planes anuales",
              "libros de catedra",
              "registros de clases",
              "actas de seguimiento academico."
            ],
            "instruments": "Grilla de revision de libro de catedra; observacion de practica docente; encuesta a estudiantes y docentes.",
            "source": "Docentes, coordinacion academica, secretaria academica."
          },
          {
            "id": "2.1.c",
            "description": "Condiciones de desarrollo de las clases y tamano de grupos adecuados.",
            "requiredDocs": [
              "Nominas de matricula por curso",
              "distribucion de grupos",
              "horarios",
              "asignacion de aulas",
              "criterios de cupo o capacidad."
            ],
            "instruments": "Ficha de observacion de aula; encuesta a estudiantes y docentes; matriz de relacion matricula-capacidad-aula.",
            "source": "Secretaria academica, coordinacion de carrera, administracion de sede."
          }
        ]
      },
      {
        "id": "2.2",
        "name": "Pertinencia de los procesos de ensenanza y aprendizaje",
        "indicators": [
          {
            "id": "2.2.a",
            "description": "Pertinencia de las metodologias de ensenanza aplicadas.",
            "requiredDocs": [
              "Programas de asignatura",
              "planes de clase",
              "libros de catedra",
              "orientaciones metodologicas",
              "evidencias de actividades practicas."
            ],
            "instruments": "Grilla de autoevaluacion docente; observacion de practica pedagogica; encuesta a estudiantes.",
            "source": "Docentes, coordinacion academica, comite pedagogico."
          },
          {
            "id": "2.2.b",
            "description": "Pertinencia, claridad y coherencia de la evaluacion del aprendizaje.",
            "requiredDocs": [
              "Reglamento de evaluacion",
              "rubricas",
              "instrumentos de evaluacion",
              "cronogramas",
              "muestras de examenes y trabajos",
              "retroalimentaciones."
            ],
            "instruments": "Lista de cotejo de evaluacion; encuesta a estudiantes y docentes; entrevista a coordinacion academica.",
            "source": "Docentes, secretaria academica, coordinacion de carrera."
          },
          {
            "id": "2.2.c",
            "description": "Disponibilidad y uso pertinente de recursos didacticos y tecnologicos.",
            "requiredDocs": [
              "Inventario de recursos",
              "plan de uso de TIC",
              "evidencias de plataformas",
              "reportes de laboratorio",
              "bibliografia de apoyo por asignatura."
            ],
            "instruments": "Ficha de observacion de recursos; encuesta a estudiantes y docentes; matriz asignatura-recurso.",
            "source": "Docentes, administracion, soporte tecnologico, biblioteca."
          }
        ]
      },
      {
        "id": "2.3",
        "name": "Impacto del apoyo y acompanamiento estudiantil",
        "indicators": [
          {
            "id": "2.3.a",
            "description": "Existencia e impacto de tutoria, orientacion y acompanamiento academico.",
            "requiredDocs": [
              "Programa de tutorias",
              "resoluciones o lineamientos",
              "registros de tutoria",
              "informes de seguimiento",
              "derivaciones o acciones de apoyo."
            ],
            "instruments": "Ficha de seguimiento de tutoria; encuesta a estudiantes; entrevista a tutores y coordinacion.",
            "source": "Bienestar estudiantil, coordinacion de carrera, tutores."
          },
          {
            "id": "2.3.b",
            "description": "Apoyos economicos, bienestar, salud e inclusion para favorecer permanencia.",
            "requiredDocs": [
              "Programas de becas",
              "listado de beneficiarios",
              "reglamentos de apoyo",
              "convenios de salud",
              "protocolos de inclusion",
              "informes de bienestar."
            ],
            "instruments": "Encuesta a estudiantes; entrevista a bienestar estudiantil; matriz de programas y cobertura.",
            "source": "Bienestar estudiantil, administracion, trabajo social, secretaria academica."
          },
          {
            "id": "2.3.c",
            "description": "Actividades complementarias para la formacion integral y su impacto.",
            "requiredDocs": [
              "Planes e informes de actividades culturales, deportivas, extension y desarrollo personal",
              "registros de asistencia",
              "evidencias de participacion."
            ],
            "instruments": "Encuesta a estudiantes; ficha de sistematizacion de actividades; entrevista a responsables.",
            "source": "Extension, bienestar estudiantil, coordinacion de carrera."
          }
        ]
      },
      {
        "id": "2.4",
        "name": "Eficacia del avance academico de los estudiantes",
        "indicators": [
          {
            "id": "2.4.a",
            "description": "Identificacion y registro oportuno de dificultades academicas y trayectorias.",
            "requiredDocs": [
              "Reportes de rendimiento",
              "estadisticas de aprobacion, reprobacion, retiro y permanencia",
              "alertas tempranas",
              "actas de seguimiento."
            ],
            "instruments": "Matriz de analisis academico por cohorte; entrevista a secretaria academica; encuesta a estudiantes y docentes.",
            "source": "Secretaria academica, coordinacion de carrera, docentes."
          },
          {
            "id": "2.4.b",
            "description": "Acciones de apoyo implementadas para mejorar el rendimiento y permanencia.",
            "requiredDocs": [
              "Planes de refuerzo",
              "tutorias",
              "clases de apoyo",
              "derivaciones",
              "informes de intervencion",
              "seguimiento de casos."
            ],
            "instruments": "Ficha de seguimiento de acciones de apoyo; entrevista a tutores; encuesta a estudiantes.",
            "source": "Coordinacion academica, tutores, bienestar estudiantil."
          },
          {
            "id": "2.4.c",
            "description": "Resultados academicos coherentes con los aprendizajes previstos.",
            "requiredDocs": [
              "Resultados por asignatura",
              "tasas de aprobacion",
              "informes de logro de aprendizaje",
              "muestras evaluativas",
              "analisis de desempeno."
            ],
            "instruments": "Matriz de resultados y aprendizajes; revision de evaluaciones; entrevista a docentes y coordinacion.",
            "source": "Docentes, coordinacion academica, secretaria academica."
          }
        ]
      }
    ]
  },
  {
    "id": "3",
    "name": "Condiciones instaladas y recursos",
    "criteria": [
      {
        "id": "3.1",
        "name": "Pertinencia de los perfiles y la dotacion de recursos humanos",
        "indicators": [
          {
            "id": "3.1.a",
            "description": "Perfiles, formacion y pertinencia del personal docente, directivo y administrativo.",
            "requiredDocs": [
              "Curriculos",
              "titulos",
              "certificados",
              "perfiles de cargo",
              "resoluciones de nombramiento",
              "legajos actualizados."
            ],
            "instruments": "Ficha de revision de legajos; encuesta a estudiantes y docentes; entrevista a talento humano.",
            "source": "Talento humano, secretaria general, direccion academica."
          },
          {
            "id": "3.1.b",
            "description": "Suficiencia cuantitativa del personal para el desarrollo de la carrera.",
            "requiredDocs": [
              "Nomina de personal",
              "distribucion de carga",
              "relacion docente-estudiante",
              "cuadros de personal",
              "necesidades de cobertura."
            ],
            "instruments": "Matriz de dotacion y suficiencia; encuesta a estudiantes y docentes; entrevista a coordinacion.",
            "source": "Talento humano, coordinacion de carrera, rectorado."
          },
          {
            "id": "3.1.c",
            "description": "Distribucion funcional y apoyo institucional del personal.",
            "requiredDocs": [
              "Manual de funciones",
              "organigrama operativo",
              "resoluciones de asignacion",
              "actas de coordinacion",
              "reportes de servicio."
            ],
            "instruments": "Entrevista a directivos y administrativos; encuesta a estudiantes y docentes; lista de cotejo funcional.",
            "source": "Talento humano, administracion, coordinacion de carrera."
          }
        ]
      },
      {
        "id": "3.2",
        "name": "Pertinencia de la infraestructura, bibliografia y tecnologia",
        "indicators": [
          {
            "id": "3.2.a",
            "description": "Infraestructura fisica, ambientes y equipamiento suficientes y adecuados.",
            "requiredDocs": [
              "Planos",
              "inventarios",
              "informes de infraestructura",
              "registros de mantenimiento",
              "certificaciones de seguridad",
              "asignacion de ambientes."
            ],
            "instruments": "Ficha de observacion de infraestructura; encuesta a estudiantes y docentes; lista de cotejo de seguridad y equipamiento.",
            "source": "Administracion de sede, mantenimiento, coordinacion academica."
          },
          {
            "id": "3.2.b",
            "description": "Bibliografia pertinente, suficiente y actualizada para la carrera.",
            "requiredDocs": [
              "Inventario bibliografico",
              "catalogo",
              "relacion bibliografia basica y complementaria por asignatura",
              "adquisiciones recientes",
              "reglamento de biblioteca."
            ],
            "instruments": "Ficha de revision bibliografica; encuesta a estudiantes y docentes; matriz asignatura-bibliografia-disponibilidad.",
            "source": "Biblioteca, docentes, coordinacion academica."
          },
          {
            "id": "3.2.c",
            "description": "Recursos tecnologicos, conectividad y soporte para el proceso formativo.",
            "requiredDocs": [
              "Inventario de equipos",
              "plan de conectividad",
              "reportes de red",
              "licencias de software",
              "registros de soporte tecnico",
              "evidencias de plataforma virtual."
            ],
            "instruments": "Ficha de observacion tecnologica; encuesta a estudiantes y docentes; entrevista a soporte TIC.",
            "source": "Soporte TIC, administracion, docentes, coordinacion de carrera."
          }
        ]
      },
      {
        "id": "3.3",
        "name": "Integridad en la gestion administrativa y financiera",
        "indicators": [
          {
            "id": "3.3.a",
            "description": "Procesos de inscripcion, registro y control academico organizados y confiables.",
            "requiredDocs": [
              "Procedimientos administrativos",
              "registros academicos",
              "actas",
              "formularios",
              "reportes del sistema",
              "cronogramas de tramites",
              "evidencias de emision de documentos."
            ],
            "instruments": "Lista de cotejo de procesos; encuesta a estudiantes; entrevista a secretaria academica y administrativa.",
            "source": "Secretaria academica, secretaria administrativa, registro academico."
          },
          {
            "id": "3.3.b",
            "description": "Gestion y uso de recursos financieros conforme a normativa institucional y legal.",
            "requiredDocs": [
              "Presupuesto de la carrera o sede",
              "ejecucion presupuestaria",
              "informes financieros",
              "respaldos de compras e inversiones",
              "normativa aplicable."
            ],
            "instruments": "Ficha de revision financiera; entrevista a administracion y contabilidad; matriz de trazabilidad gasto-necesidad-indicador.",
            "source": "Administracion, contabilidad, rectorado."
          },
          {
            "id": "3.3.c",
            "description": "Socializacion de informes de gestion administrativa y financiera con transparencia.",
            "requiredDocs": [
              "Informes de gestion",
              "actas de socializacion",
              "presentaciones",
              "comunicados",
              "reportes de rendicion de cuentas."
            ],
            "instruments": "Entrevista a directivos y administracion; encuesta a estudiantes y docentes; lista de cotejo de transparencia.",
            "source": "Rectorado, administracion, direccion academica."
          }
        ]
      }
    ]
  }
] as const;
