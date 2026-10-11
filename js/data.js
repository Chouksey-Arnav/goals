// Course content, transcribed lesson by lesson from Udemy sidebar screenshots.
// Lesson tuple: [number, exact title, video minutes, kind]
//
// kind:
//   "video"    watch and code along
//   "article"  short reading
//   "exercise" attempt it yourself BEFORE any solution video
//   "project"  a bigger build; attempt fully before the solution videos
//   "solution" watch only after you attempted the exercise/project
//   "quiz"     short Udemy quiz (unnumbered in the sidebar)
//   "watch"    watch for the idea only, no setup or code along
//   "pending"  lesson exists (count and section length are known from the
//              sidebar) but its name was not in a screenshot yet
//
// Pending durations are estimates: the section's total length split evenly.

export const DEADLINE = "2026-10-31";
export const TRACK_START = "2026-10-11";

// Estimated real work time per kind. Video time is not study time: you pause,
// type the code, and get stuck. These multipliers are assumptions, tune them
// in one place if a week of real data says otherwise.
export const EFFORT = {
  video: (m) => Math.round(m * 1.5),
  article: (m) => Math.max(3, m * 2),
  exercise: (m) => Math.max(20, m * 4),
  project: () => 75,
  solution: (m) => m,
  pending: (m) => Math.round(m * 1.5),
  quiz: () => 5,
  watch: (m) => m,
};

export const KIND_LABEL = {
  video: "Watch + code along",
  article: "Read",
  exercise: "Solve first",
  project: "Build first",
  solution: "Check your work",
  pending: "Name pending",
  quiz: "Quiz",
  watch: "Watch only",
};

export const KIND_TIP = {
  video: "Code along in your own notebook. Do not just watch.",
  article: "Quick read. Note anything that changes how you code.",
  exercise: "Pause and solve on paper or in code before he reveals anything. Being wrong first is the point.",
  project: "Open a blank notebook and build the whole thing yourself. Only then watch the solutions.",
  solution: "Compare against your attempt. Write down one thing you did differently.",
  pending: "Name not loaded yet. Send a screenshot of this section to fill it in.",
  quiz: "Answer from memory first. Only look back at your notes for the ones you miss.",
  watch: "Watch for the big idea. No need to set anything up or code along.",
};

export const COURSES = [
  {
    id: "krohn",
    title: "Mathematical Foundations of Machine Learning",
    short: "Math Foundations",
    instructor: "Jon Krohn",
    platform: "Udemy",
    color: "amber",
    sections: [
      {
        title: "Section 8 (final lesson)",
        note: "Section name not in screenshot",
        lessons: [[77, "Machine Learning with Autodiff", 40, "video"]],
      },
      {
        title: "Section 9: Partial Derivative Calculus",
        lessons: [
          [78, "Segment Intro", 23, "video"],
          [79, "What Partial Derivatives Are", 29, "video"],
          [80, "Partial Derivative Exercises", 6, "exercise"],
          [81, "Calculating Partial Derivatives with Autodiff", 5, "video"],
          [82, "Advanced Partial Derivatives", 15, "video"],
          [83, "Advanced Partial-Derivative Exercises", 6, "exercise"],
          [84, "Partial Derivative Notation", 2, "video"],
          [85, "The Chain Rule for Partial Derivatives", 9, "video"],
          [86, "Exercises on the Multivariate Chain Rule", 5, "exercise"],
          [87, "Point-by-Point Regression", 15, "video"],
          [88, "The Gradient of Quadratic Cost", 15, "video"],
          [89, "Descending the Gradient of Cost", 13, "video"],
          [90, "The Gradient of Mean Squared Error", 24, "video"],
          [91, "Backpropagation", 6, "video"],
          [92, "Higher-Order Partial Derivatives", 12, "video"],
          [93, "Exercise on Higher-Order Partial Derivatives", 3, "exercise"],
        ],
      },
      {
        title: "Section 10: Integral Calculus",
        lessons: [
          [94, "Segment Intro", 3, "video"],
          [95, "Binary Classification", 9, "video"],
          [96, "The Confusion Matrix", 2, "video"],
          [97, "The Receiver-Operating Characteristic (ROC) Curve", 10, "video"],
          [98, "What Integral Calculus Is", 6, "video"],
          [99, "The Integral Calculus Rules", 6, "video"],
          [100, "Indefinite Integral Exercises", 3, "exercise"],
          [101, "Definite Integrals", 7, "video"],
          [102, "Numeric Integration with Python", 5, "video"],
          [103, "Definite Integral Exercise", 4, "exercise"],
          [104, "Finding the Area Under the ROC Curve", 4, "video"],
          [105, "Resources for the Further Study of Calculus", 4, "video"],
          [106, "Congratulations!", 2, "video"],
        ],
      },
      {
        title: "Section 11: Probability",
        lessons: [
          [107, "Probability & Information Theory", 8, "video"],
          [108, "A Brief History of Probability Theory", 4, "video"],
          [109, "What Probability Theory Is", 5, "video"],
          [110, "Events and Sample Spaces", 9, "video"],
          [111, "Multiple Independent Observations", 8, "video"],
          [112, "Combinatorics", 7, "video"],
          [113, "Exercises on Event Probabilities", 10, "exercise"],
          [114, "More Lectures are on their Way!", 1, "article"],
        ],
      },
    ],
  },
  {
    id: "portilla",
    title: "Python for Data Science and Machine Learning Bootcamp",
    short: "Python DS + ML Bootcamp",
    instructor: "Jose Portilla",
    platform: "Udemy",
    color: "cyan",
    // Lessons finished before this tracker existed.
    preDone: [16, 18, 19],
    sections: [
      {
        title: "Section 5: Python for Data Analysis - NumPy",
        note: "Section name inferred, header not in screenshot",
        lessons: [
          [16, "Welcome to the NumPy Section!", 1, "video"],
          [17, "Introduction to Numpy", 2, "video"],
          [18, "Numpy Arrays", 17, "video"],
          [19, "Quick Note on Array Indexing", 1, "article"],
          [20, "Numpy Array Indexing", 18, "video"],
          [21, "Numpy Operations", 7, "video"],
          [22, "Numpy Exercises Overview", 3, "exercise"],
          [23, "Numpy Exercises Solutions", 16, "solution"],
        ],
      },
      {
        title: "Section 6: Python for Data Analysis - Pandas",
        lessons: [
          [24, "Welcome to the Pandas Section!", 1, "video"],
          [25, "Introduction to Pandas", 2, "video"],
          [26, "Series", 11, "video"],
          [27, "DataFrames - Part 1", 16, "video"],
          [28, "DataFrames - Part 2", 17, "video"],
          [29, "DataFrames - Part 3", 9, "video"],
          [30, "Missing Data", 6, "video"],
          [31, "Groupby", 7, "video"],
          [32, "Merging Joining and Concatenating", 9, "video"],
          [33, "Operations", 12, "video"],
          [34, "Data Input and Output", 14, "video"],
        ],
      },
      {
        title: "Section 7: Python for Data Analysis - Pandas Exercises",
        note: "5 lessons, 35 min. Names pending screenshot",
        lessons: [
          [35, "Lesson 35", 7, "pending"],
          [36, "Lesson 36", 7, "pending"],
          [37, "Lesson 37", 7, "pending"],
          [38, "Lesson 38", 7, "pending"],
          [39, "Lesson 39", 7, "pending"],
        ],
      },
      {
        title: "Section 8: Python for Data Visualization - Matplotlib",
        note: "7 lessons, 1 hr. Lessons 40 to 44 pending screenshot",
        lessons: [
          [40, "Lesson 40", 10, "pending"],
          [41, "Lesson 41", 10, "pending"],
          [42, "Lesson 42", 10, "pending"],
          [43, "Lesson 43", 9, "pending"],
          [44, "Lesson 44", 9, "pending"],
          [45, "Matplotlib Exercises Overview", 2, "exercise"],
          [46, "Matplotlib Exercises - Solutions", 10, "solution"],
        ],
      },
      {
        title: "Section 9: Python for Data Visualization - Seaborn",
        lessons: [
          [47, "Introduction to Seaborn", 3, "video"],
          [48, "Distribution Plots", 18, "video"],
          [49, "Categorical Plots", 17, "video"],
          [50, "Matrix Plots", 10, "video"],
          [51, "Grids", 9, "video"],
          [52, "Regression Plots", 7, "video"],
          [53, "Style and Color", 8, "video"],
          [54, "Seaborn Exercise Overview", 2, "exercise"],
          [55, "Seaborn Exercise Solutions", 7, "solution"],
        ],
      },
      {
        title: "Section 10: Python for Data Visualization - Pandas Built-in Data Visualization",
        lessons: [
          [56, "Pandas Built-in Data Visualization", 13, "video"],
          [57, "Pandas Data Visualization Exercise", 1, "exercise"],
          [58, "Pandas Data Visualization Exercise- Solutions", 9, "solution"],
        ],
      },
      {
        title: "Section 11: Python for Data Visualization - Plotly and Cufflinks",
        optional: "Not on the IOAI syllabus, and Cufflinks is unmaintained and often breaks installs.",
        lessons: [
          [59, "Introduction to Plotly and Cufflinks", 3, "video"],
          [60, "READ ME FIRST BEFORE PLOTLY PLEASE!", 1, "article"],
          [61, "Plotly and Cufflinks", 19, "video"],
        ],
      },
      {
        title: "Section 12: Python for Data Visualization - Geographical Plotting",
        optional: "Not on the IOAI syllabus.",
        lessons: [
          [62, "Introduction to Geographical Plotting", 1, "video"],
          [63, "Choropleth Maps - Part 1 - USA", 19, "video"],
          [64, "Choropleth Maps - Part 2 - World", 7, "video"],
          [65, "Choropleth Exercises", 3, "exercise"],
          [66, "Choropleth Exercises - Solutions", 10, "solution"],
        ],
      },
      {
        title: "Section 13: Data Capstone Project",
        lessons: [
          [67, "Welcome to the Data Capstone Projects!", 1, "video"],
          [68, "911 Calls Project Overview", 2, "project"],
          [69, "911 Calls Solutions - Part 1", 14, "solution"],
          [70, "911 Calls Solutions - Part 2", 18, "solution"],
          [71, "Bank Data", 1, "article", { optional: "The 911 Calls project already drills pandas; the finance project depends on stock-data downloads that often break." }],
          [72, "Finance Data Project Overview", 3, "project", { optional: "The 911 Calls project already drills pandas; the finance project depends on stock-data downloads that often break." }],
          [73, "Finance Project - Solutions Part 1", 16, "solution", { optional: "The 911 Calls project already drills pandas; the finance project depends on stock-data downloads that often break." }],
          [74, "Finance Project - Solutions Part 2", 18, "solution", { optional: "The 911 Calls project already drills pandas; the finance project depends on stock-data downloads that often break." }],
          [75, "Finance Project - Solutions Part 3", 6, "solution", { optional: "The 911 Calls project already drills pandas; the finance project depends on stock-data downloads that often break." }],
        ],
      },
      {
        title: "Section 14: Introduction to Machine Learning",
        lessons: [
          [76, "Welcome to Machine Learning. Here are a few resources to get you started!", 1, "article"],
          [77, "Welcome to the Machine Learning Section!", 1, "video"],
          [78, "Supervised Learning Overview", 8, "video"],
          [79, "Evaluating Performance - Classification Error Metrics", 17, "video"],
          [80, "Evaluating Performance - Regression Error Metrics", 6, "video"],
          [81, "Machine Learning with Python", 9, "video"],
        ],
      },
      {
        title: "Section 15: Linear Regression",
        lessons: [
          [82, "Linear Regression Theory", 5, "video"],
          [83, "model_selection Updates for SciKit Learn 0.18", 1, "article"],
          [84, "Linear Regression with Python - Part 1", 18, "video"],
          [85, "Linear Regression with Python - Part 2", 7, "video"],
          [86, "Linear Regression Project Overview", 3, "project"],
          [87, "Linear Regression Project Solution", 19, "solution"],
        ],
      },
      {
        title: "Section 16: Cross Validation and Bias-Variance Trade-Off",
        lessons: [[88, "Bias Variance Trade-Off", 6, "video"]],
      },
      {
        title: "Section 17: Logistic Regression",
        lessons: [
          [89, "Logistic Regression Theory", 12, "video"],
          [90, "Logistic Regression with Python - Part 1", 18, "video"],
          [91, "Logistic Regression with Python - Part 2", 17, "video"],
          [92, "Logistic Regression with Python - Part 3", 8, "video"],
          [93, "Logistic Regression Project Overview", 2, "project"],
          [94, "Logistic Regression Project Solutions", 11, "solution"],
        ],
      },
      {
        title: "Section 18: K Nearest Neighbors",
        lessons: [
          [95, "KNN Theory", 6, "video"],
          [96, "KNN with Python", 20, "video"],
          [97, "KNN Project Overview", 1, "project"],
          [98, "KNN Project Solutions", 14, "solution"],
        ],
      },
      {
        title: "Section 19: Decision Trees and Random Forests",
        lessons: [
          [99, "Introduction to Tree Methods", 7, "video"],
          [100, "Decision Trees and Random Forest with Python", 14, "video"],
          [101, "Decision Trees and Random Forest Project Overview", 3, "project"],
          [102, "Decision Trees and Random Forest Solutions Part 1", 12, "solution"],
          [103, "Decision Trees and Random Forest Solutions Part 2", 9, "solution"],
        ],
      },
      {
        title: "Section 20: Support Vector Machines",
        lessons: [
          [104, "SVM Theory", 5, "video"],
          [105, "Support Vector Machines with Python", 18, "video"],
          [106, "SVM Project Overview", 2, "project"],
          [107, "SVM Project Solutions", 10, "solution"],
        ],
      },
      {
        title: "Section 21: K Means Clustering",
        lessons: [
          [108, "K Means Algorithm Theory", 5, "video"],
          [109, "K Means with Python", 13, "video"],
          [110, "K Means Project Overview", 3, "project"],
          [111, "K Means Project Solutions", 17, "solution"],
        ],
      },
      {
        title: "Section 22: Principal Component Analysis",
        lessons: [
          [112, "Principal Component Analysis", 3, "video"],
          [113, "PCA with Python", 17, "video"],
        ],
      },
      {
        title: "Section 23: Recommender Systems",
        optional: "Not on the IOAI syllabus.",
        lessons: [
          [114, "Recommender Systems", 4, "video"],
          [115, "Recommender Systems with Python - Part 1", 14, "video"],
          [116, "Recommender Systems with Python - Part 2", 13, "video"],
        ],
      },
      {
        title: "Section 24: Natural Language Processing",
        lessons: [
          [117, "Natural Language Processing Theory", 5, "video"],
          [118, "NLP with Python - Part 1", 16, "video"],
          [119, "NLP with Python - Part 2", 19, "video"],
          [120, "NLP with Python - Part 3", 18, "video"],
          [121, "NLP Project Overview", 2, "project"],
          [122, "NLP Project Solutions", 19, "solution"],
        ],
      },
      {
        title: "Section 25: Neural Nets and Deep Learning",
        lessons: [
          [123, "Download TensorFlow Notebooks Here", 1, "article"],
          ["Quiz 1", "Quick Check for Notes", 2, "quiz"],
          [124, "Welcome to the Deep Learning Section!", 1, "video"],
          [125, "Introduction to Artificial Neural Networks (ANN)", 2, "video"],
          [126, "Installing Tensorflow", 1, "article"],
          [127, "Perceptron Model", 11, "video"],
          [128, "Neural Networks", 7, "video"],
          [129, "Activation Functions", 11, "video"],
          [130, "Multi-Class Classification Considerations", 11, "video"],
          [131, "Cost Functions and Gradient Descent", 18, "video"],
          [132, "Backpropagation", 15, "video"],
          [133, "TensorFlow vs Keras", 2, "video"],
          [134, "TF Syntax Basics - Part One - Preparing the Data", 11, "video"],
          [135, "TF Syntax Basics - Part Two - Creating and Training the Model", 14, "video"],
          [136, "TF Syntax Basics - Part Three - Model Evaluation", 13, "video"],
          [137, "TF Regression Code Along - Exploratory Data Analysis", 19, "video"],
          [138, "TF Regression Code Along - Exploratory Data Analysis - Continued", 13, "video"],
          [139, "TF Regression Code Along - Data Preprocessing and Creating a Model", 9, "video"],
          [140, "TF Regression Code Along - Model Evaluation and Predictions", 11, "video"],
          [141, "TF Classification Code Along - EDA and Preprocessing", 8, "video"],
          [142, "TF Classification - Dealing with Overfitting and Evaluation", 17, "video"],
          [143, "TensorFlow 2.0 Project Options Overview", 2, "video"],
          [144, "TensorFlow 2.0 Project Notebook Overview", 8, "project"],
          [145, "Keras Project Solutions - Dealing with Missing Data", 21, "solution"],
          [146, "Keras Project Solutions - Dealing with Missing Data - Part Two", 15, "solution"],
          [147, "Keras Project Solutions - Categorical Data", 12, "solution"],
          [148, "Keras Project Solutions - Data PreProcessing", 17, "solution"],
          [149, "Keras Project Solutions - Data PreProcessing", 4, "solution"],
          [150, "Keras Project Solutions - Creating and Training a Model", 4, "solution"],
          [151, "Keras Project Solutions - Model Evaluation", 10, "solution"],
          [152, "Tensorboard", 18, "video", { optional: "TensorFlow-only tooling. The olympiad expects PyTorch." }],
        ],
      },
      {
        title: "Section 26: Big Data and Spark with Python",
        optional: "Spark and big data are not on the IOAI syllabus. Watch only if you have spare time.",
        lessons: [
          [153, "Welcome to the Big Data Section!", 1, "watch"],
          [154, "Big Data Overview", 6, "watch"],
          [155, "Spark Overview", 9, "watch"],
          [156, "Local Spark Set-Up", 1, "watch"],
          [157, "AWS Account Set-Up", 4, "watch", { optional: "Needs an AWS account and a credit card. Never in the plan.", hard: true }],
          [158, "Quick Note on AWS Security", 1, "watch", { optional: "Needs an AWS account and a credit card. Never in the plan.", hard: true }],
          [159, "EC2 Instance Set-Up", 16, "watch", { optional: "Needs an AWS account and a credit card. Never in the plan.", hard: true }],
          [160, "SSH with Mac or Linux", 5, "watch", { optional: "Needs an AWS account and a credit card. Never in the plan.", hard: true }],
          [161, "PySpark Setup", 24, "watch", { optional: "Needs an AWS account and a credit card. Never in the plan.", hard: true }],
          [162, "Lambda Expressions Review", 5, "watch"],
          [163, "Introduction to Spark and Python", 8, "watch"],
          [164, "RDD Transformations and Actions", 23, "watch"],
        ],
      },
      {
        title: "Section 27: BONUS SECTION: THANK YOU!",
        optional: "Promo lecture, no content.",
        lessons: [[165, "Bonus Lecture", 1, "video"]],
      },
    ],
    // Sections known to exist but with no lesson data yet. The plan cannot
    // schedule what it cannot see, so the UI warns that the real load is higher.
    notLoaded: [],
  },
];

// Flatten into lesson objects with stable ids, in course order.
export function allLessons(courses = COURSES) {
  const out = [];
  for (const c of courses) {
    c.sections.forEach((s, si) => {
      for (const [n, title, min, kind, opts = {}] of s.lessons) {
        out.push({
          id: `${c.id}-${String(n).toLowerCase().replace(/\s+/g, "")}`,
          course: c.id,
          n,
          label: typeof n === "number" ? `Lesson ${n}` : n,
          title,
          min,
          kind,
          section: s.title,
          sectionIndex: si,
          effort: EFFORT[kind](min),
          // Optional lessons stay tickable but are left out of the daily plan.
          optional: opts.optional || s.optional || null,
          hard: !!opts.hard,
        });
      }
    });
  }
  return out;
}

// Lessons the daily plan schedules. Optional ones only if the setting asks,
// and "hard" optional ones (AWS setup) never.
export function plannable(lessons, includeOptional = false) {
  return lessons.filter((l) => !l.optional || (includeOptional && !l.hard));
}
